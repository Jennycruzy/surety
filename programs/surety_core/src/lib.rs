#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::{get_return_data, invoke},
};
use anchor_spl::token_interface::{
    self, Burn, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
};
use solana_sha256_hasher::hash;

mod txline;
use txline::{
    BinaryExpression, Comparison, NDimensionalStrategy, OddsValidationInput, StatPredicate,
    StatValidationInput, TraderPredicate,
};

declare_id!("3e5rBR2J9uHPHHn6tP8HF6mPbEJsJWtzQEyicv6v8qVW");

const VAULT_VERSION: u8 = 1;
const POLICY_VERSION: u8 = 1;
const MAX_PREDICATE_BYTES: usize = 32;
const BPS_DENOMINATOR: u128 = 10_000;
const MAX_TXLINE_PROOF_NODES: usize = 32;
const MAX_SETTLEMENT_STATS: usize = 4;
const MAX_ODDS_AGE_MS: i64 = 15 * 60 * 1_000;
const MAX_ODDS_FUTURE_SKEW_MS: i64 = 30 * 1_000;
const ATTESTATION_DOMAIN: &[u8] = b"SURETY_ATTESTATION_V1";
const VERIFIED_QUOTE_DOMAIN: &[u8] = b"SURETY_TXLINE_ODDS_QUOTE_V1";

#[program]
pub mod surety_core {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        vault_id: [u8; 32],
        max_bucket_bps: u16,
        epoch_seconds: i64,
        margin_bps: u16,
        formula_version: u16,
    ) -> Result<()> {
        require!(
            max_bucket_bps > 0 && max_bucket_bps <= 10_000,
            SuretyError::InvalidBucketCap
        );
        require!(epoch_seconds > 0, SuretyError::InvalidEpoch);
        require!(margin_bps >= 10_000, SuretyError::InvalidMargin);
        require!(formula_version > 0, SuretyError::InvalidFormulaVersion);

        let vault = &mut ctx.accounts.vault;
        vault.version = VAULT_VERSION;
        vault.bump = ctx.bumps.vault;
        vault.asset_decimals = ctx.accounts.asset_mint.decimals;
        vault.vault_id = vault_id;
        vault.authority = ctx.accounts.authority.key();
        vault.asset_mint = ctx.accounts.asset_mint.key();
        vault.reserve = ctx.accounts.reserve.key();
        vault.share_mint = ctx.accounts.share_mint.key();
        vault.total_capital = 0;
        vault.free_reserves = 0;
        vault.locked_liabilities = 0;
        vault.max_bucket_bps = max_bucket_bps;
        vault.epoch_seconds = epoch_seconds;
        vault.policy_count = 0;
        vault.attestation_seq = 0;
        vault.latest_attestation_hash = [0; 32];
        vault.margin_bps = margin_bps;
        vault.formula_version = formula_version;

        assert_reserve_exact(vault, ctx.accounts.reserve.amount)?;
        emit!(VaultInitialized {
            vault: vault.key(),
            asset_mint: vault.asset_mint,
            share_mint: vault.share_mint,
            max_bucket_bps,
            epoch_seconds,
        });
        Ok(())
    }

    pub fn lp_deposit(ctx: Context<LpDeposit>, assets: u64) -> Result<()> {
        require!(assets > 0, SuretyError::ZeroAmount);
        let vault = &mut ctx.accounts.vault;
        reconcile_reserve(vault, ctx.accounts.reserve.amount)?;

        let shares = deposit_shares(assets, vault.total_capital, ctx.accounts.share_mint.supply)?;
        require!(shares > 0, SuretyError::DepositTooSmall);

        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.asset_mint,
            &ctx.accounts.lp_asset_account,
            &ctx.accounts.reserve,
            &ctx.accounts.lp.to_account_info(),
            assets,
            None,
        )?;

        let vault_id = vault.vault_id;
        let bump = [vault.bump];
        let signer_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &bump];
        let mint_accounts = MintTo {
            mint: ctx.accounts.share_mint.to_account_info(),
            to: ctx.accounts.lp_share_account.to_account_info(),
            authority: vault.to_account_info(),
        };
        token_interface::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                mint_accounts,
                &[signer_seeds],
            ),
            shares,
        )?;

        vault.total_capital = checked_add(vault.total_capital, assets)?;
        vault.free_reserves = checked_add(vault.free_reserves, assets)?;
        assert_accounting_invariant(vault)?;

        emit!(LpDeposited {
            vault: vault.key(),
            lp: ctx.accounts.lp.key(),
            assets,
            shares,
        });
        Ok(())
    }

    pub fn request_withdrawal(
        ctx: Context<RequestWithdrawal>,
        request_id: u64,
        shares: u64,
    ) -> Result<()> {
        require!(shares > 0, SuretyError::ZeroAmount);
        reconcile_reserve(&mut ctx.accounts.vault, ctx.accounts.reserve.amount)?;

        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.share_mint,
            &ctx.accounts.lp_share_account,
            &ctx.accounts.request_share_account,
            &ctx.accounts.lp.to_account_info(),
            shares,
            None,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let withdrawal = &mut ctx.accounts.withdrawal;
        withdrawal.vault = ctx.accounts.vault.key();
        withdrawal.lp = ctx.accounts.lp.key();
        withdrawal.share_account = ctx.accounts.request_share_account.key();
        withdrawal.request_id = request_id;
        withdrawal.shares = shares;
        withdrawal.unlock_ts = next_epoch(now, ctx.accounts.vault.epoch_seconds)?;
        withdrawal.bump = ctx.bumps.withdrawal;
        withdrawal.status = WithdrawalStatus::Pending;

        emit!(WithdrawalRequested {
            vault: ctx.accounts.vault.key(),
            lp: ctx.accounts.lp.key(),
            request: withdrawal.key(),
            shares,
            unlock_ts: withdrawal.unlock_ts,
        });
        Ok(())
    }

    pub fn execute_withdrawal(ctx: Context<ExecuteWithdrawal>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(
            ctx.accounts.withdrawal.status == WithdrawalStatus::Pending,
            SuretyError::WithdrawalNotPending
        );
        require!(
            now >= ctx.accounts.withdrawal.unlock_ts,
            SuretyError::EpochNotReached
        );

        let vault = &mut ctx.accounts.vault;
        reconcile_reserve(vault, ctx.accounts.reserve.amount)?;
        let assets = withdrawal_assets(
            ctx.accounts.withdrawal.shares,
            vault.total_capital,
            ctx.accounts.share_mint.supply,
        )?;
        require!(assets > 0, SuretyError::WithdrawalTooSmall);
        require!(
            vault.free_reserves >= assets,
            SuretyError::InsufficientFreeReserves
        );

        let request_id_bytes = ctx.accounts.withdrawal.request_id.to_le_bytes();
        let withdrawal_bump = [ctx.accounts.withdrawal.bump];
        let vault_key = vault.key();
        let withdrawal_seeds: &[&[u8]] = &[
            b"withdrawal",
            vault_key.as_ref(),
            ctx.accounts.withdrawal.lp.as_ref(),
            request_id_bytes.as_ref(),
            &withdrawal_bump,
        ];
        let burn_accounts = Burn {
            mint: ctx.accounts.share_mint.to_account_info(),
            from: ctx.accounts.request_share_account.to_account_info(),
            authority: ctx.accounts.withdrawal.to_account_info(),
        };
        token_interface::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                burn_accounts,
                &[withdrawal_seeds],
            ),
            ctx.accounts.withdrawal.shares,
        )?;

        let vault_id = vault.vault_id;
        let vault_bump = [vault.bump];
        let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &vault_bump];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.asset_mint,
            &ctx.accounts.reserve,
            &ctx.accounts.lp_asset_account,
            &vault.to_account_info(),
            assets,
            Some(vault_seeds),
        )?;

        vault.total_capital = checked_sub(vault.total_capital, assets)?;
        vault.free_reserves = checked_sub(vault.free_reserves, assets)?;
        ctx.accounts.withdrawal.status = WithdrawalStatus::Executed;
        assert_accounting_invariant(vault)?;

        emit!(WithdrawalExecuted {
            vault: vault.key(),
            lp: ctx.accounts.withdrawal.lp,
            request: ctx.accounts.withdrawal.key(),
            assets,
            shares: ctx.accounts.withdrawal.shares,
        });
        Ok(())
    }

    pub fn issue_policy(ctx: Context<IssuePolicy>, args: IssuePolicyArgs) -> Result<()> {
        require!(
            ctx.accounts.vault.formula_version == 1,
            SuretyError::ValidatedOddsRequired
        );
        issue_policy_core(
            &ctx.accounts.holder,
            &mut ctx.accounts.vault,
            &ctx.accounts.asset_mint,
            &mut ctx.accounts.reserve,
            &ctx.accounts.holder_asset_account,
            &mut ctx.accounts.bucket,
            &mut ctx.accounts.policy,
            &ctx.accounts.policy_escrow,
            &ctx.accounts.token_program,
            ctx.bumps.bucket,
            ctx.bumps.policy,
            &args,
        )
    }

    pub fn record_validated_odds(
        ctx: Context<RecordValidatedOdds>,
        message_id_key: [u8; 16],
        proof: OddsValidationInput,
    ) -> Result<()> {
        let message_id_hash = hash(proof.odds_snapshot.message_id.as_bytes()).to_bytes();
        require!(
            message_id_hash[..16] == message_id_key,
            SuretyError::OddsMessageHashMismatch
        );
        let validation_receipt_hash = validate_txline_odds(
            &ctx.accounts.txline_program,
            &ctx.accounts.daily_odds_merkle_roots,
            &proof,
        )?;

        let receipt = &mut ctx.accounts.validated_odds;
        receipt.version = 1;
        receipt.bump = ctx.bumps.validated_odds;
        receipt.fixture_id = proof.odds_snapshot.fixture_id;
        receipt.odds_timestamp_ms = proof.odds_snapshot.ts;
        receipt.message_id_key = message_id_key;
        receipt.message_id_hash = message_id_hash;
        receipt.validation_receipt_hash = validation_receipt_hash;
        receipt.prices = proof
            .odds_snapshot
            .prices
            .as_slice()
            .try_into()
            .map_err(|_| error!(SuretyError::InvalidOddsMarket))?;

        emit!(OddsValidated {
            validated_odds: receipt.key(),
            fixture_id: receipt.fixture_id,
            odds_timestamp_ms: receipt.odds_timestamp_ms,
            message_id_hash: receipt.message_id_hash,
            validation_receipt_hash: receipt.validation_receipt_hash,
            prices: receipt.prices,
        });
        Ok(())
    }

    pub fn issue_policy_with_validated_odds(
        ctx: Context<IssuePolicyWithValidatedOdds>,
        args: IssuePolicyArgs,
    ) -> Result<()> {
        reconcile_reserve(&mut ctx.accounts.vault, ctx.accounts.reserve.amount)?;
        let probability_ppm = validate_verified_quote(
            &ctx.accounts.vault,
            &ctx.accounts.bucket,
            &ctx.accounts.validated_odds,
            &args,
        )?;

        issue_policy_core(
            &ctx.accounts.holder,
            &mut ctx.accounts.vault,
            &ctx.accounts.asset_mint,
            &mut ctx.accounts.reserve,
            &ctx.accounts.holder_asset_account,
            &mut ctx.accounts.bucket,
            &mut ctx.accounts.policy,
            &ctx.accounts.policy_escrow,
            &ctx.accounts.token_program,
            ctx.bumps.bucket,
            ctx.bumps.policy,
            &args,
        )?;

        emit!(PolicyIssuedWithValidatedOdds {
            policy: ctx.accounts.policy.key(),
            validated_odds: ctx.accounts.validated_odds.key(),
            fixture_id: ctx.accounts.validated_odds.fixture_id,
            odds_timestamp_ms: ctx.accounts.validated_odds.odds_timestamp_ms,
            message_id_hash: ctx.accounts.validated_odds.message_id_hash,
            validation_receipt_hash: ctx.accounts.validated_odds.validation_receipt_hash,
            probability_ppm,
            premium: args.premium,
        });
        Ok(())
    }

    pub fn expire_policy(ctx: Context<ExpirePolicy>) -> Result<()> {
        require!(
            ctx.accounts.policy.status == PolicyStatus::Open,
            SuretyError::PolicyNotOpen
        );
        require!(
            Clock::get()?.unix_timestamp >= ctx.accounts.policy.expires_at,
            SuretyError::PolicyNotExpired
        );

        let vault = &mut ctx.accounts.vault;
        reconcile_reserve(vault, ctx.accounts.reserve.amount)?;
        require!(
            ctx.accounts.policy_escrow.amount >= ctx.accounts.policy.coverage,
            SuretyError::EscrowBalanceMismatch
        );

        let nonce_bytes = ctx.accounts.policy.nonce.to_le_bytes();
        let policy_bump = [ctx.accounts.policy.bump];
        let vault_key = vault.key();
        let policy_seeds: &[&[u8]] = &[
            b"policy",
            vault_key.as_ref(),
            ctx.accounts.policy.holder.as_ref(),
            ctx.accounts.policy.predicate_hash.as_ref(),
            nonce_bytes.as_ref(),
            &policy_bump,
        ];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.asset_mint,
            &ctx.accounts.policy_escrow,
            &ctx.accounts.reserve,
            &ctx.accounts.policy.to_account_info(),
            ctx.accounts.policy_escrow.amount,
            Some(policy_seeds),
        )?;

        let coverage = ctx.accounts.policy.coverage;
        let escrow_amount = ctx.accounts.policy_escrow.amount;
        let escrow_donation = checked_sub(escrow_amount, coverage)?;
        vault.total_capital = checked_add(vault.total_capital, escrow_donation)?;
        vault.free_reserves = checked_add(vault.free_reserves, escrow_amount)?;
        vault.locked_liabilities = checked_sub(vault.locked_liabilities, coverage)?;
        ctx.accounts.bucket.locked_exposure =
            checked_sub(ctx.accounts.bucket.locked_exposure, coverage)?;
        ctx.accounts.bucket.open_policy_count =
            checked_sub(ctx.accounts.bucket.open_policy_count, 1)?;
        ctx.accounts.policy.status = PolicyStatus::Expired;
        assert_accounting_invariant(vault)?;

        emit!(PolicyExpired {
            vault: vault.key(),
            policy: ctx.accounts.policy.key(),
            caller: ctx.accounts.caller.key(),
            coverage,
        });
        Ok(())
    }

    pub fn settle_policy(ctx: Context<SettlePolicy>, payload: StatValidationInput) -> Result<()> {
        require!(
            ctx.accounts.policy.status == PolicyStatus::Open,
            SuretyError::PolicyNotOpen
        );
        validate_proof_bounds(&payload)?;

        let strategy = strategy_for_policy(
            &ctx.accounts.policy.predicate_bytes[..usize::from(ctx.accounts.policy.predicate_len)],
            &payload,
        )?;
        let expected_root = daily_scores_root(payload.ts)?;
        require_keys_eq!(
            ctx.accounts.daily_scores_merkle_roots.key(),
            expected_root,
            SuretyError::InvalidTxlineRoot
        );
        require_keys_eq!(
            *ctx.accounts.daily_scores_merkle_roots.owner,
            txline::PROGRAM_ID,
            SuretyError::InvalidTxlineRoot
        );

        let mut cpi_data = txline::VALIDATE_STAT_V2_DISCRIMINATOR.to_vec();
        txline::ValidateStatV2Args {
            payload: &payload,
            strategy: &strategy,
        }
        .serialize(&mut cpi_data)
        .map_err(|_| error!(SuretyError::TxlineSerializationFailed))?;
        let receipt_hash = hash(&cpi_data).to_bytes();
        let validation_ix = Instruction {
            program_id: txline::PROGRAM_ID,
            accounts: vec![AccountMeta::new_readonly(expected_root, false)],
            data: cpi_data,
        };
        invoke(
            &validation_ix,
            &[
                ctx.accounts.daily_scores_merkle_roots.to_account_info(),
                ctx.accounts.txline_program.to_account_info(),
            ],
        )?;
        let (return_program, return_bytes) =
            get_return_data().ok_or_else(|| error!(SuretyError::MissingTxlineReturnData))?;
        require_keys_eq!(
            return_program,
            txline::PROGRAM_ID,
            SuretyError::InvalidTxlineReturnProgram
        );
        require!(
            return_bytes.as_slice() == [1u8],
            SuretyError::TxlinePredicateRejected
        );

        let vault = &mut ctx.accounts.vault;
        reconcile_reserve(vault, ctx.accounts.reserve.amount)?;
        require!(
            ctx.accounts.policy_escrow.amount >= ctx.accounts.policy.coverage,
            SuretyError::EscrowBalanceMismatch
        );

        let nonce_bytes = ctx.accounts.policy.nonce.to_le_bytes();
        let policy_bump = [ctx.accounts.policy.bump];
        let vault_key = vault.key();
        let policy_seeds: &[&[u8]] = &[
            b"policy",
            vault_key.as_ref(),
            ctx.accounts.policy.holder.as_ref(),
            ctx.accounts.policy.predicate_hash.as_ref(),
            nonce_bytes.as_ref(),
            &policy_bump,
        ];
        transfer_tokens(
            &ctx.accounts.token_program,
            &ctx.accounts.asset_mint,
            &ctx.accounts.policy_escrow,
            &ctx.accounts.payout_account,
            &ctx.accounts.policy.to_account_info(),
            ctx.accounts.policy.coverage,
            Some(policy_seeds),
        )?;

        let coverage = ctx.accounts.policy.coverage;
        vault.total_capital = checked_sub(vault.total_capital, coverage)?;
        vault.locked_liabilities = checked_sub(vault.locked_liabilities, coverage)?;
        ctx.accounts.bucket.locked_exposure =
            checked_sub(ctx.accounts.bucket.locked_exposure, coverage)?;
        ctx.accounts.bucket.open_policy_count =
            checked_sub(ctx.accounts.bucket.open_policy_count, 1)?;
        ctx.accounts.policy.status = PolicyStatus::Triggered;
        ctx.accounts.policy.merkle_receipt_hash = receipt_hash;
        assert_accounting_invariant(vault)?;

        emit!(PolicySettled {
            vault: vault.key(),
            policy: ctx.accounts.policy.key(),
            caller: ctx.accounts.caller.key(),
            payout_authority: ctx.accounts.policy.payout_authority,
            coverage,
            merkle_receipt_hash: receipt_hash,
        });
        Ok(())
    }

    pub fn post_attestation(
        ctx: Context<PostAttestation>,
        args: PostAttestationArgs,
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(
            args.seq
                == vault
                    .attestation_seq
                    .checked_add(1)
                    .ok_or(SuretyError::MathOverflow)?,
            SuretyError::InvalidAttestationSequence
        );
        require!(
            args.prev_hash == vault.latest_attestation_hash,
            SuretyError::InvalidAttestationPreviousHash
        );
        require!(
            args.reserves == vault.total_capital
                && args.locked_collateral == vault.locked_liabilities,
            SuretyError::AttestationBookMismatch
        );
        let expected_ratio = if args.marked_liabilities == 0 {
            0
        } else {
            u64::try_from(
                (u128::from(args.reserves) * BPS_DENOMINATOR) / u128::from(args.marked_liabilities),
            )
            .map_err(|_| error!(SuretyError::MathOverflow))?
        };
        require!(
            args.solvency_ratio_bps == expected_ratio,
            SuretyError::InvalidSolvencyRatio
        );
        let expected_hash = attestation_hash(&args);
        require!(
            args.record_hash == expected_hash,
            SuretyError::InvalidAttestationHash
        );

        let attestation = &mut ctx.accounts.attestation;
        attestation.vault = vault.key();
        attestation.seq = args.seq;
        attestation.prev_hash = args.prev_hash;
        attestation.record_hash = args.record_hash;
        attestation.odds_packet_hash = args.odds_packet_hash;
        attestation.book_snapshot_hash = args.book_snapshot_hash;
        attestation.reserves = args.reserves;
        attestation.locked_collateral = args.locked_collateral;
        attestation.marked_liabilities = args.marked_liabilities;
        attestation.solvency_ratio_bps = args.solvency_ratio_bps;
        attestation.observed_at_ms = args.observed_at_ms;
        attestation.bump = ctx.bumps.attestation;
        vault.attestation_seq = args.seq;
        vault.latest_attestation_hash = expected_hash;

        emit!(AttestationPosted {
            vault: vault.key(),
            attestation: attestation.key(),
            seq: args.seq,
            prev_hash: args.prev_hash,
            record_hash: expected_hash,
            reserves: args.reserves,
            marked_liabilities: args.marked_liabilities,
            solvency_ratio_bps: args.solvency_ratio_bps,
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct IssuePolicyArgs {
    pub nonce: u64,
    pub predicate_len: u8,
    pub predicate_bytes: [u8; MAX_PREDICATE_BYTES],
    pub predicate_hash: [u8; 32],
    pub quote_hash: [u8; 32],
    pub bucket_hash: [u8; 32],
    pub payout_authority: Pubkey,
    pub coverage: u64,
    pub premium: u64,
    pub expires_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct PostAttestationArgs {
    pub seq: u64,
    pub prev_hash: [u8; 32],
    pub record_hash: [u8; 32],
    pub odds_packet_hash: [u8; 32],
    pub book_snapshot_hash: [u8; 32],
    pub reserves: u64,
    pub locked_collateral: u64,
    pub marked_liabilities: u64,
    pub solvency_ratio_bps: u64,
    pub observed_at_ms: i64,
}

#[derive(Accounts)]
#[instruction(vault_id: [u8; 32])]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", vault_id.as_ref()],
        bump
    )]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        seeds = [b"reserve", vault.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = vault,
        token::token_program = token_program
    )]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = authority,
        seeds = [b"share_mint", vault.key().as_ref()],
        bump,
        mint::decimals = asset_mint.decimals,
        mint::authority = vault,
        mint::token_program = token_program
    )]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LpDeposit<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = lp)]
    pub lp_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = share_mint, token::authority = lp)]
    pub lp_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(request_id: u64)]
pub struct RequestWithdrawal<'info> {
    #[account(mut)]
    pub lp: Signer<'info>,
    #[account(mut, has_one = reserve, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = share_mint, token::authority = lp)]
    pub lp_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init,
        payer = lp,
        space = 8 + WithdrawalRequest::INIT_SPACE,
        seeds = [b"withdrawal", vault.key().as_ref(), lp.key().as_ref(), request_id.to_le_bytes().as_ref()],
        bump
    )]
    pub withdrawal: Box<Account<'info, WithdrawalRequest>>,
    #[account(
        init,
        payer = lp,
        seeds = [b"withdrawal_shares", withdrawal.key().as_ref()],
        bump,
        token::mint = share_mint,
        token::authority = withdrawal,
        token::token_program = token_program
    )]
    pub request_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteWithdrawal<'info> {
    pub caller: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve, has_one = share_mint)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut)]
    pub share_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, has_one = vault, constraint = withdrawal.share_account == request_share_account.key())]
    pub withdrawal: Box<Account<'info, WithdrawalRequest>>,
    #[account(mut, address = withdrawal.share_account, token::mint = share_mint, token::authority = withdrawal)]
    pub request_share_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = asset_mint, token::authority = withdrawal.lp)]
    pub lp_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(args: IssuePolicyArgs)]
pub struct IssuePolicy<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = asset_mint, token::authority = holder)]
    pub holder_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = holder,
        space = 8 + ExposureBucket::INIT_SPACE,
        seeds = [b"bucket", vault.key().as_ref(), args.bucket_hash.as_ref()],
        bump
    )]
    pub bucket: Box<Account<'info, ExposureBucket>>,
    #[account(
        init,
        payer = holder,
        space = 8 + Policy::INIT_SPACE,
        seeds = [
            b"policy",
            vault.key().as_ref(),
            holder.key().as_ref(),
            args.predicate_hash.as_ref(),
            args.nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub policy: Box<Account<'info, Policy>>,
    #[account(
        init,
        payer = holder,
        seeds = [b"policy_escrow", policy.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = policy,
        token::token_program = token_program
    )]
    pub policy_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(message_id_key: [u8; 16], proof: OddsValidationInput)]
pub struct RecordValidatedOdds<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + ValidatedOdds::INIT_SPACE,
        seeds = [b"validated_odds", message_id_key.as_ref()],
        bump
    )]
    pub validated_odds: Box<Account<'info, ValidatedOdds>>,
    /// CHECK: fixed to TxLINE's executable devnet program.
    #[account(address = txline::PROGRAM_ID, executable)]
    pub txline_program: UncheckedAccount<'info>,
    /// CHECK: exact PDA and TxLINE ownership are verified before CPI.
    pub daily_odds_merkle_roots: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: IssuePolicyArgs)]
pub struct IssuePolicyWithValidatedOdds<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = asset_mint, token::authority = holder)]
    pub holder_asset_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = holder,
        space = 8 + ExposureBucket::INIT_SPACE,
        seeds = [b"bucket", vault.key().as_ref(), args.bucket_hash.as_ref()],
        bump
    )]
    pub bucket: Box<Account<'info, ExposureBucket>>,
    #[account(
        init,
        payer = holder,
        space = 8 + Policy::INIT_SPACE,
        seeds = [
            b"policy",
            vault.key().as_ref(),
            holder.key().as_ref(),
            args.predicate_hash.as_ref(),
            args.nonce.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub policy: Box<Account<'info, Policy>>,
    #[account(
        init,
        payer = holder,
        seeds = [b"policy_escrow", policy.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = policy,
        token::token_program = token_program
    )]
    pub policy_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        seeds = [b"validated_odds", validated_odds.message_id_key.as_ref()],
        bump = validated_odds.bump
    )]
    pub validated_odds: Box<Account<'info, ValidatedOdds>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExpirePolicy<'info> {
    pub caller: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, has_one = vault)]
    pub bucket: Box<Account<'info, ExposureBucket>>,
    #[account(mut, has_one = vault, has_one = bucket, constraint = policy.escrow == policy_escrow.key())]
    pub policy: Box<Account<'info, Policy>>,
    #[account(mut, address = policy.escrow, token::mint = asset_mint, token::authority = policy)]
    pub policy_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettlePolicy<'info> {
    pub caller: Signer<'info>,
    #[account(mut, has_one = asset_mint, has_one = reserve)]
    pub vault: Box<Account<'info, Vault>>,
    pub asset_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = asset_mint, token::authority = vault)]
    pub reserve: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, has_one = vault)]
    pub bucket: Box<Account<'info, ExposureBucket>>,
    #[account(mut, has_one = vault, has_one = bucket, constraint = policy.escrow == policy_escrow.key())]
    pub policy: Box<Account<'info, Policy>>,
    #[account(mut, address = policy.escrow, token::mint = asset_mint, token::authority = policy)]
    pub policy_escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, token::mint = asset_mint, token::authority = policy.payout_authority)]
    pub payout_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: address, executable flag, root PDA, and return-data program are verified.
    #[account(address = txline::PROGRAM_ID, executable)]
    pub txline_program: UncheckedAccount<'info>,
    /// CHECK: exact PDA and TxLINE ownership are verified before CPI.
    pub daily_scores_merkle_roots: UncheckedAccount<'info>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(args: PostAttestationArgs)]
pub struct PostAttestation<'info> {
    #[account(mut, address = vault.authority)]
    pub attestor: Signer<'info>,
    #[account(mut)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(
        init,
        payer = attestor,
        space = 8 + SolvencyAttestation::INIT_SPACE,
        seeds = [b"attestation", vault.key().as_ref(), args.seq.to_le_bytes().as_ref()],
        bump
    )]
    pub attestation: Box<Account<'info, SolvencyAttestation>>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub version: u8,
    pub bump: u8,
    pub asset_decimals: u8,
    pub vault_id: [u8; 32],
    pub authority: Pubkey,
    pub asset_mint: Pubkey,
    pub reserve: Pubkey,
    pub share_mint: Pubkey,
    pub total_capital: u64,
    pub free_reserves: u64,
    pub locked_liabilities: u64,
    pub max_bucket_bps: u16,
    pub epoch_seconds: i64,
    pub policy_count: u64,
    pub attestation_seq: u64,
    pub latest_attestation_hash: [u8; 32],
    pub margin_bps: u16,
    pub formula_version: u16,
}

#[account]
#[derive(InitSpace)]
pub struct ExposureBucket {
    pub vault: Pubkey,
    pub bucket_hash: [u8; 32],
    pub locked_exposure: u64,
    pub open_policy_count: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub version: u8,
    pub status: PolicyStatus,
    pub bump: u8,
    pub predicate_len: u8,
    pub vault: Pubkey,
    pub holder: Pubkey,
    pub payout_authority: Pubkey,
    pub bucket: Pubkey,
    pub escrow: Pubkey,
    pub predicate_hash: [u8; 32],
    pub quote_hash: [u8; 32],
    pub bucket_hash: [u8; 32],
    pub merkle_receipt_hash: [u8; 32],
    pub predicate_bytes: [u8; MAX_PREDICATE_BYTES],
    pub nonce: u64,
    pub coverage: u64,
    pub premium: u64,
    pub expires_at: i64,
    pub created_at: i64,
}

#[account]
#[derive(InitSpace)]
pub struct ValidatedOdds {
    pub version: u8,
    pub bump: u8,
    pub fixture_id: i64,
    pub odds_timestamp_ms: i64,
    pub message_id_key: [u8; 16],
    pub message_id_hash: [u8; 32],
    pub validation_receipt_hash: [u8; 32],
    pub prices: [i32; 3],
}

#[account]
#[derive(InitSpace)]
pub struct WithdrawalRequest {
    pub vault: Pubkey,
    pub lp: Pubkey,
    pub share_account: Pubkey,
    pub request_id: u64,
    pub shares: u64,
    pub unlock_ts: i64,
    pub bump: u8,
    pub status: WithdrawalStatus,
}

#[account]
#[derive(InitSpace)]
pub struct SolvencyAttestation {
    pub vault: Pubkey,
    pub seq: u64,
    pub prev_hash: [u8; 32],
    pub record_hash: [u8; 32],
    pub odds_packet_hash: [u8; 32],
    pub book_snapshot_hash: [u8; 32],
    pub reserves: u64,
    pub locked_collateral: u64,
    pub marked_liabilities: u64,
    pub solvency_ratio_bps: u64,
    pub observed_at_ms: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum PolicyStatus {
    Open,
    Triggered,
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum WithdrawalStatus {
    Pending,
    Executed,
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub asset_mint: Pubkey,
    pub share_mint: Pubkey,
    pub max_bucket_bps: u16,
    pub epoch_seconds: i64,
}

#[event]
pub struct LpDeposited {
    pub vault: Pubkey,
    pub lp: Pubkey,
    pub assets: u64,
    pub shares: u64,
}

#[event]
pub struct WithdrawalRequested {
    pub vault: Pubkey,
    pub lp: Pubkey,
    pub request: Pubkey,
    pub shares: u64,
    pub unlock_ts: i64,
}

#[event]
pub struct WithdrawalExecuted {
    pub vault: Pubkey,
    pub lp: Pubkey,
    pub request: Pubkey,
    pub assets: u64,
    pub shares: u64,
}

#[event]
pub struct PolicyIssued {
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub holder: Pubkey,
    pub coverage: u64,
    pub premium: u64,
    pub predicate_hash: [u8; 32],
    pub quote_hash: [u8; 32],
    pub bucket_hash: [u8; 32],
}

#[event]
pub struct PolicyExpired {
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub caller: Pubkey,
    pub coverage: u64,
}

#[event]
pub struct PolicySettled {
    pub vault: Pubkey,
    pub policy: Pubkey,
    pub caller: Pubkey,
    pub payout_authority: Pubkey,
    pub coverage: u64,
    pub merkle_receipt_hash: [u8; 32],
}

#[event]
pub struct OddsValidated {
    pub validated_odds: Pubkey,
    pub fixture_id: i64,
    pub odds_timestamp_ms: i64,
    pub message_id_hash: [u8; 32],
    pub validation_receipt_hash: [u8; 32],
    pub prices: [i32; 3],
}

#[event]
pub struct PolicyIssuedWithValidatedOdds {
    pub policy: Pubkey,
    pub validated_odds: Pubkey,
    pub fixture_id: i64,
    pub odds_timestamp_ms: i64,
    pub message_id_hash: [u8; 32],
    pub validation_receipt_hash: [u8; 32],
    pub probability_ppm: u32,
    pub premium: u64,
}

#[event]
pub struct AttestationPosted {
    pub vault: Pubkey,
    pub attestation: Pubkey,
    pub seq: u64,
    pub prev_hash: [u8; 32],
    pub record_hash: [u8; 32],
    pub reserves: u64,
    pub marked_liabilities: u64,
    pub solvency_ratio_bps: u64,
}

#[error_code]
pub enum SuretyError {
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("coverage must be greater than zero")]
    ZeroCoverage,
    #[msg("premium must be greater than zero")]
    ZeroPremium,
    #[msg("bucket cap must be between 1 and 10,000 basis points")]
    InvalidBucketCap,
    #[msg("withdrawal epoch must be greater than zero")]
    InvalidEpoch,
    #[msg("margin must be at least 10,000 basis points")]
    InvalidMargin,
    #[msg("formula version must be non-zero")]
    InvalidFormulaVersion,
    #[msg("arithmetic overflow")]
    MathOverflow,
    #[msg("arithmetic underflow")]
    MathUnderflow,
    #[msg("vault accounting invariant failed")]
    SolvencyInvariantViolation,
    #[msg("reserve token balance does not match free-reserve accounting")]
    ReserveBalanceMismatch,
    #[msg("deposit is too small to mint one share")]
    DepositTooSmall,
    #[msg("withdrawal is too small to return one asset unit")]
    WithdrawalTooSmall,
    #[msg("withdrawal request is not pending")]
    WithdrawalNotPending,
    #[msg("withdrawal epoch has not been reached")]
    EpochNotReached,
    #[msg("vault does not have enough free reserves")]
    InsufficientFreeReserves,
    #[msg("vault has no LP capital")]
    EmptyVault,
    #[msg("outcome bucket cap would be exceeded")]
    BucketCapExceeded,
    #[msg("predicate encoding is empty or too long")]
    InvalidPredicate,
    #[msg("predicate hash does not match canonical predicate bytes")]
    PredicateHashMismatch,
    #[msg("policy expiry must be in the future")]
    InvalidExpiry,
    #[msg("policy is not open")]
    PolicyNotOpen,
    #[msg("policy has not reached its expiry")]
    PolicyNotExpired,
    #[msg("policy escrow does not contain the full coverage amount")]
    EscrowBalanceMismatch,
    #[msg("share supply and capital state are inconsistent")]
    InvalidShareSupply,
    #[msg("TxLINE proof contains too many nodes or stats")]
    TxlineProofTooLarge,
    #[msg("TxLINE proof timestamp cannot derive a valid daily root")]
    InvalidProofTimestamp,
    #[msg("TxLINE daily scores root is not the expected program-owned PDA")]
    InvalidTxlineRoot,
    #[msg("failed to serialize the pinned TxLINE validation instruction")]
    TxlineSerializationFailed,
    #[msg("TxLINE validation CPI returned no result")]
    MissingTxlineReturnData,
    #[msg("validation return data did not originate from TxLINE")]
    InvalidTxlineReturnProgram,
    #[msg("TxLINE rejected the policy predicate")]
    TxlinePredicateRejected,
    #[msg("settlement proof does not exactly match the policy predicate")]
    SettlementPredicateMismatch,
    #[msg("settlement requires TxLINE final-period statistics")]
    SettlementNotFinal,
    #[msg("attestation sequence must extend the current vault head")]
    InvalidAttestationSequence,
    #[msg("attestation previous hash does not match the current vault head")]
    InvalidAttestationPreviousHash,
    #[msg("attested reserves or locked collateral do not match the vault")]
    AttestationBookMismatch,
    #[msg("attested solvency ratio does not match reserves and marked liabilities")]
    InvalidSolvencyRatio,
    #[msg("attestation record hash does not match its canonical fields")]
    InvalidAttestationHash,
    #[msg("TxLINE rejected the odds record or its Merkle proof")]
    TxlineOddsRejected,
    #[msg("TxLINE odds record is not a supported full-match 1X2 market")]
    InvalidOddsMarket,
    #[msg("TxLINE odds record does not match the policy fixture or outcome")]
    OddsPolicyMismatch,
    #[msg("odds message ID does not match the receipt PDA hash")]
    OddsMessageHashMismatch,
    #[msg("TxLINE odds proof is too old or dated too far in the future")]
    StaleOddsProof,
    #[msg("policy premium does not match the on-chain calculation from validated odds")]
    OddsPremiumMismatch,
    #[msg("quote hash does not commit to the validated TxLINE proof and policy terms")]
    VerifiedQuoteHashMismatch,
    #[msg("this vault requires TxLINE-validated odds issuance")]
    ValidatedOddsRequired,
}

#[allow(clippy::too_many_arguments)]
fn issue_policy_core<'info>(
    holder: &Signer<'info>,
    vault: &mut Account<'info, Vault>,
    asset_mint: &InterfaceAccount<'info, Mint>,
    reserve: &mut InterfaceAccount<'info, TokenAccount>,
    holder_asset_account: &InterfaceAccount<'info, TokenAccount>,
    bucket: &mut Account<'info, ExposureBucket>,
    policy: &mut Account<'info, Policy>,
    policy_escrow: &InterfaceAccount<'info, TokenAccount>,
    token_program: &Interface<'info, TokenInterface>,
    bucket_bump: u8,
    policy_bump: u8,
    args: &IssuePolicyArgs,
) -> Result<()> {
    require!(args.coverage > 0, SuretyError::ZeroCoverage);
    require!(args.premium > 0, SuretyError::ZeroPremium);
    require!(
        args.predicate_len > 0 && usize::from(args.predicate_len) <= MAX_PREDICATE_BYTES,
        SuretyError::InvalidPredicate
    );
    require!(
        args.expires_at > Clock::get()?.unix_timestamp,
        SuretyError::InvalidExpiry
    );
    require!(
        hash(&args.predicate_bytes[..usize::from(args.predicate_len)]).to_bytes()
            == args.predicate_hash,
        SuretyError::PredicateHashMismatch
    );

    reconcile_reserve(vault, reserve.amount)?;
    require!(vault.total_capital > 0, SuretyError::EmptyVault);
    require!(
        vault
            .free_reserves
            .checked_add(args.premium)
            .ok_or(SuretyError::MathOverflow)?
            >= args.coverage,
        SuretyError::InsufficientFreeReserves
    );

    if bucket.vault == Pubkey::default() {
        bucket.vault = vault.key();
        bucket.bucket_hash = args.bucket_hash;
        bucket.locked_exposure = 0;
        bucket.open_policy_count = 0;
        bucket.bump = bucket_bump;
    }
    let new_bucket_exposure = checked_add(bucket.locked_exposure, args.coverage)?;
    let cap = bucket_cap(vault.total_capital, vault.max_bucket_bps)?;
    require!(new_bucket_exposure <= cap, SuretyError::BucketCapExceeded);

    transfer_tokens(
        token_program,
        asset_mint,
        holder_asset_account,
        reserve,
        &holder.to_account_info(),
        args.premium,
        None,
    )?;

    let vault_id = vault.vault_id;
    let vault_bump = [vault.bump];
    let vault_seeds: &[&[u8]] = &[b"vault", vault_id.as_ref(), &vault_bump];
    transfer_tokens(
        token_program,
        asset_mint,
        reserve,
        policy_escrow,
        &vault.to_account_info(),
        args.coverage,
        Some(vault_seeds),
    )?;

    policy.version = POLICY_VERSION;
    policy.status = PolicyStatus::Open;
    policy.bump = policy_bump;
    policy.predicate_len = args.predicate_len;
    policy.vault = vault.key();
    policy.holder = holder.key();
    policy.payout_authority = args.payout_authority;
    policy.bucket = bucket.key();
    policy.escrow = policy_escrow.key();
    policy.predicate_hash = args.predicate_hash;
    policy.quote_hash = args.quote_hash;
    policy.bucket_hash = args.bucket_hash;
    policy.merkle_receipt_hash = [0; 32];
    policy.predicate_bytes = args.predicate_bytes;
    policy.nonce = args.nonce;
    policy.coverage = args.coverage;
    policy.premium = args.premium;
    policy.expires_at = args.expires_at;
    policy.created_at = Clock::get()?.unix_timestamp;

    vault.total_capital = checked_add(vault.total_capital, args.premium)?;
    vault.free_reserves = checked_add(vault.free_reserves, args.premium)?;
    vault.free_reserves = checked_sub(vault.free_reserves, args.coverage)?;
    vault.locked_liabilities = checked_add(vault.locked_liabilities, args.coverage)?;
    vault.policy_count = checked_add(vault.policy_count, 1)?;
    bucket.locked_exposure = new_bucket_exposure;
    bucket.open_policy_count = checked_add(bucket.open_policy_count, 1)?;
    assert_accounting_invariant(vault)?;

    emit!(PolicyIssued {
        vault: vault.key(),
        policy: policy.key(),
        holder: policy.holder,
        coverage: policy.coverage,
        premium: policy.premium,
        predicate_hash: policy.predicate_hash,
        quote_hash: policy.quote_hash,
        bucket_hash: policy.bucket_hash,
    });
    Ok(())
}

fn validate_txline_odds<'info>(
    txline_program: &UncheckedAccount<'info>,
    daily_odds_merkle_roots: &UncheckedAccount<'info>,
    proof: &OddsValidationInput,
) -> Result<[u8; 32]> {
    let odds = &proof.odds_snapshot;
    require!(
        proof.sub_tree_proof.len() <= MAX_TXLINE_PROOF_NODES
            && proof.main_tree_proof.len() <= MAX_TXLINE_PROOF_NODES,
        SuretyError::TxlineProofTooLarge
    );
    require!(
        odds.fixture_id > 0
            && odds.fixture_id == proof.summary.fixture_id
            && proof.summary.update_stats.min_timestamp <= odds.ts
            && odds.ts <= proof.summary.update_stats.max_timestamp,
        SuretyError::InvalidOddsMarket
    );
    require!(
        odds.bookmaker == "TXLineStablePriceDemargined"
            && odds.super_odds_type == "1X2_PARTICIPANT_RESULT"
            && odds.market_parameters.is_none()
            && odds.market_period.is_none()
            && odds.price_names.len() == 3
            && odds.price_names[0] == "part1"
            && odds.price_names[1] == "draw"
            && odds.price_names[2] == "part2"
            && odds.prices.len() == 3
            && odds.prices.iter().all(|price| *price > 0),
        SuretyError::InvalidOddsMarket
    );

    let expected_root = daily_odds_root(odds.ts)?;
    require_keys_eq!(
        daily_odds_merkle_roots.key(),
        expected_root,
        SuretyError::InvalidTxlineRoot
    );
    require_keys_eq!(
        *daily_odds_merkle_roots.owner,
        txline::PROGRAM_ID,
        SuretyError::InvalidTxlineRoot
    );

    let mut cpi_data = txline::VALIDATE_ODDS_DISCRIMINATOR.to_vec();
    txline::ValidateOddsArgs {
        ts: odds.ts,
        odds_snapshot: odds,
        summary: &proof.summary,
        sub_tree_proof: &proof.sub_tree_proof,
        main_tree_proof: &proof.main_tree_proof,
    }
    .serialize(&mut cpi_data)
    .map_err(|_| error!(SuretyError::TxlineSerializationFailed))?;
    let validation_receipt_hash = hash(&cpi_data).to_bytes();
    let validation_ix = Instruction {
        program_id: txline::PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(expected_root, false)],
        data: cpi_data,
    };
    invoke(
        &validation_ix,
        &[
            daily_odds_merkle_roots.to_account_info(),
            txline_program.to_account_info(),
        ],
    )?;
    let (return_program, return_bytes) =
        get_return_data().ok_or_else(|| error!(SuretyError::MissingTxlineReturnData))?;
    require_keys_eq!(
        return_program,
        txline::PROGRAM_ID,
        SuretyError::InvalidTxlineReturnProgram
    );
    require!(
        return_bytes.as_slice() == [1u8],
        SuretyError::TxlineOddsRejected
    );
    Ok(validation_receipt_hash)
}

fn validate_verified_quote(
    vault: &Account<Vault>,
    bucket: &Account<ExposureBucket>,
    validated_odds: &Account<ValidatedOdds>,
    args: &IssuePolicyArgs,
) -> Result<u32> {
    require!(
        matches!(vault.formula_version, 1 | 2),
        SuretyError::InvalidFormulaVersion
    );
    let now_ms = Clock::get()?
        .unix_timestamp
        .checked_mul(1_000)
        .ok_or(SuretyError::MathOverflow)?;
    let oldest = now_ms
        .checked_sub(MAX_ODDS_AGE_MS)
        .ok_or(SuretyError::MathUnderflow)?;
    let newest = now_ms
        .checked_add(MAX_ODDS_FUTURE_SKEW_MS)
        .ok_or(SuretyError::MathOverflow)?;
    require!(
        validated_odds.odds_timestamp_ms >= oldest && validated_odds.odds_timestamp_ms <= newest,
        SuretyError::StaleOddsProof
    );

    let outcome_index = policy_outcome_index(args, validated_odds.fixture_id)?;
    let current_exposure = if bucket.vault == Pubkey::default() {
        0
    } else {
        bucket.locked_exposure
    };
    let (probability_ppm, premium) = validated_quote_terms(
        vault.total_capital,
        vault.max_bucket_bps,
        current_exposure,
        args.coverage,
        vault.margin_bps,
        validated_odds.prices,
        outcome_index,
    )?;
    require!(args.premium == premium, SuretyError::OddsPremiumMismatch);

    let expected_quote_hash = verified_quote_hash(
        vault.key(),
        validated_odds.key(),
        probability_ppm,
        args,
        validated_odds.validation_receipt_hash,
    );
    require!(
        args.quote_hash == expected_quote_hash,
        SuretyError::VerifiedQuoteHashMismatch
    );
    Ok(probability_ppm)
}

fn validated_quote_terms(
    total_capital: u64,
    max_bucket_bps: u16,
    current_exposure: u64,
    coverage: u64,
    margin_bps: u16,
    prices: [i32; 3],
    outcome_index: usize,
) -> Result<(u32, u64)> {
    let probability_ppm = normalized_probability_ppm(prices, outcome_index)?;
    let cap = bucket_cap(total_capital, max_bucket_bps)?;
    let projected_exposure = checked_add(current_exposure, coverage)?;
    require!(projected_exposure < cap, SuretyError::BucketCapExceeded);
    let utilization_bps = ceil_div_u128(
        u128::from(projected_exposure) * BPS_DENOMINATOR,
        u128::from(cap),
    )?;
    let surcharge_bps = if utilization_bps < 4_000 {
        10_000
    } else {
        10_000u128
            .checked_add(
                utilization_bps
                    .checked_sub(4_000)
                    .ok_or(SuretyError::MathUnderflow)?
                    .checked_mul(10_000)
                    .ok_or(SuretyError::MathOverflow)?
                    / 6_000,
            )
            .ok_or(SuretyError::MathOverflow)?
    };
    let premium_numerator = u128::from(coverage)
        .checked_mul(u128::from(probability_ppm))
        .and_then(|value| value.checked_mul(u128::from(margin_bps)))
        .and_then(|value| value.checked_mul(surcharge_bps))
        .ok_or(SuretyError::MathOverflow)?;
    let premium = ceil_div_u128(
        premium_numerator,
        1_000_000u128 * BPS_DENOMINATOR * BPS_DENOMINATOR,
    )?;
    let premium = u64::try_from(premium).map_err(|_| error!(SuretyError::MathOverflow))?;
    Ok((probability_ppm, premium))
}

fn policy_outcome_index(args: &IssuePolicyArgs, fixture_id: i64) -> Result<usize> {
    let length = usize::from(args.predicate_len);
    require!(length == 17, SuretyError::OddsPolicyMismatch);
    let bytes = &args.predicate_bytes[..length];
    require!(
        bytes[0] == 1
            && bytes[1] == 1
            && bytes[2] == 2
            && bytes[11] == 0
            && bytes[12] == 0
            && bytes[14..17] == [0, 0, 0],
        SuretyError::OddsPolicyMismatch
    );
    let policy_fixture = u64::from_le_bytes(
        bytes[3..11]
            .try_into()
            .map_err(|_| error!(SuretyError::OddsPolicyMismatch))?,
    );
    require!(
        i64::try_from(policy_fixture).ok() == Some(fixture_id),
        SuretyError::OddsPolicyMismatch
    );
    match bytes[13] {
        0 => Ok(0),
        1 => Ok(1),
        2 => Ok(2),
        _ => err!(SuretyError::OddsPolicyMismatch),
    }
}

fn normalized_probability_ppm(prices: [i32; 3], outcome_index: usize) -> Result<u32> {
    require!(
        prices.iter().all(|price| *price > 0),
        SuretyError::InvalidOddsMarket
    );
    require!(outcome_index < 3, SuretyError::OddsPolicyMismatch);
    let prices = prices.map(|price| u128::from(u32::try_from(price).unwrap()));
    let weights = [
        prices[1].checked_mul(prices[2]),
        prices[0].checked_mul(prices[2]),
        prices[0].checked_mul(prices[1]),
    ];
    let weights = [
        weights[0].ok_or(SuretyError::MathOverflow)?,
        weights[1].ok_or(SuretyError::MathOverflow)?,
        weights[2].ok_or(SuretyError::MathOverflow)?,
    ];
    let total = weights
        .iter()
        .try_fold(0u128, |sum, weight| sum.checked_add(*weight))
        .ok_or(SuretyError::MathOverflow)?;
    let rounded = weights[outcome_index]
        .checked_mul(1_000_000)
        .and_then(|value| value.checked_add(total / 2))
        .ok_or(SuretyError::MathOverflow)?
        / total;
    u32::try_from(rounded).map_err(|_| error!(SuretyError::MathOverflow))
}

fn ceil_div_u128(numerator: u128, denominator: u128) -> Result<u128> {
    require!(denominator > 0, SuretyError::MathUnderflow);
    numerator
        .checked_add(denominator - 1)
        .ok_or_else(|| error!(SuretyError::MathOverflow))
        .map(|value| value / denominator)
}

fn verified_quote_hash(
    vault: Pubkey,
    validated_odds: Pubkey,
    probability_ppm: u32,
    args: &IssuePolicyArgs,
    validation_receipt_hash: [u8; 32],
) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(VERIFIED_QUOTE_DOMAIN.len() + 32 * 6 + 8 * 3 + 4);
    bytes.extend_from_slice(VERIFIED_QUOTE_DOMAIN);
    bytes.extend_from_slice(vault.as_ref());
    bytes.extend_from_slice(validated_odds.as_ref());
    bytes.extend_from_slice(&validation_receipt_hash);
    bytes.extend_from_slice(&args.predicate_hash);
    bytes.extend_from_slice(&args.bucket_hash);
    bytes.extend_from_slice(&args.coverage.to_le_bytes());
    bytes.extend_from_slice(&args.premium.to_le_bytes());
    bytes.extend_from_slice(&probability_ppm.to_le_bytes());
    hash(&bytes).to_bytes()
}

fn transfer_tokens<'info>(
    token_program: &Interface<'info, TokenInterface>,
    mint: &InterfaceAccount<'info, Mint>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: Option<&[&[u8]]>,
) -> Result<()> {
    let accounts = TransferChecked {
        mint: mint.to_account_info(),
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.clone(),
    };
    let program_id = token_program.key();
    if let Some(seeds) = signer_seeds {
        token_interface::transfer_checked(
            CpiContext::new_with_signer(program_id, accounts, &[seeds]),
            amount,
            mint.decimals,
        )
    } else {
        token_interface::transfer_checked(
            CpiContext::new(program_id, accounts),
            amount,
            mint.decimals,
        )
    }
}

fn checked_add(left: u64, right: u64) -> Result<u64> {
    left.checked_add(right)
        .ok_or_else(|| error!(SuretyError::MathOverflow))
}

fn checked_sub(left: u64, right: u64) -> Result<u64> {
    left.checked_sub(right)
        .ok_or_else(|| error!(SuretyError::MathUnderflow))
}

fn deposit_shares(assets: u64, capital: u64, supply: u64) -> Result<u64> {
    if supply == 0 {
        require!(capital == 0, SuretyError::InvalidShareSupply);
        return Ok(assets);
    }
    require!(capital > 0, SuretyError::InvalidShareSupply);
    u64::try_from((u128::from(assets) * u128::from(supply)) / u128::from(capital))
        .map_err(|_| error!(SuretyError::MathOverflow))
}

fn withdrawal_assets(shares: u64, capital: u64, supply: u64) -> Result<u64> {
    require!(supply > 0, SuretyError::InvalidShareSupply);
    u64::try_from((u128::from(shares) * u128::from(capital)) / u128::from(supply))
        .map_err(|_| error!(SuretyError::MathOverflow))
}

fn bucket_cap(capital: u64, max_bucket_bps: u16) -> Result<u64> {
    u64::try_from((u128::from(capital) * u128::from(max_bucket_bps)) / BPS_DENOMINATOR)
        .map_err(|_| error!(SuretyError::MathOverflow))
}

fn next_epoch(now: i64, epoch_seconds: i64) -> Result<i64> {
    require!(now >= 0 && epoch_seconds > 0, SuretyError::InvalidEpoch);
    let epoch = now
        .checked_div(epoch_seconds)
        .ok_or(SuretyError::MathOverflow)?;
    epoch
        .checked_add(1)
        .and_then(|value| value.checked_mul(epoch_seconds))
        .ok_or_else(|| error!(SuretyError::MathOverflow))
}

fn assert_accounting_invariant(vault: &Vault) -> Result<()> {
    require!(
        vault.free_reserves.checked_add(vault.locked_liabilities) == Some(vault.total_capital),
        SuretyError::SolvencyInvariantViolation
    );
    Ok(())
}

fn assert_reserve_exact(vault: &Vault, reserve_amount: u64) -> Result<()> {
    assert_accounting_invariant(vault)?;
    require!(
        reserve_amount == vault.free_reserves,
        SuretyError::ReserveBalanceMismatch
    );
    Ok(())
}

fn reconcile_reserve(vault: &mut Vault, reserve_amount: u64) -> Result<()> {
    assert_accounting_invariant(vault)?;
    require!(
        reserve_amount >= vault.free_reserves,
        SuretyError::ReserveBalanceMismatch
    );
    let donation = checked_sub(reserve_amount, vault.free_reserves)?;
    if donation > 0 {
        vault.free_reserves = checked_add(vault.free_reserves, donation)?;
        vault.total_capital = checked_add(vault.total_capital, donation)?;
    }
    assert_accounting_invariant(vault)
}

fn validate_proof_bounds(payload: &StatValidationInput) -> Result<()> {
    require!(
        !payload.stats.is_empty() && payload.stats.len() <= MAX_SETTLEMENT_STATS,
        SuretyError::TxlineProofTooLarge
    );
    require!(
        payload.fixture_proof.len() <= MAX_TXLINE_PROOF_NODES
            && payload.main_tree_proof.len() <= MAX_TXLINE_PROOF_NODES
            && payload
                .stats
                .iter()
                .all(|leaf| leaf.stat_proof.len() <= MAX_TXLINE_PROOF_NODES),
        SuretyError::TxlineProofTooLarge
    );
    Ok(())
}

fn daily_scores_root(timestamp_ms: i64) -> Result<Pubkey> {
    require!(timestamp_ms >= 0, SuretyError::InvalidProofTimestamp);
    let epoch_day = timestamp_ms
        .checked_div(txline::MILLIS_PER_DAY)
        .ok_or(SuretyError::InvalidProofTimestamp)?;
    let epoch_day =
        u16::try_from(epoch_day).map_err(|_| error!(SuretyError::InvalidProofTimestamp))?;
    Ok(Pubkey::find_program_address(
        &[txline::DAILY_SCORES_SEED, &epoch_day.to_le_bytes()],
        &txline::PROGRAM_ID,
    )
    .0)
}

fn daily_odds_root(timestamp_ms: i64) -> Result<Pubkey> {
    require!(timestamp_ms >= 0, SuretyError::InvalidProofTimestamp);
    let epoch_day = timestamp_ms
        .checked_div(txline::MILLIS_PER_DAY)
        .ok_or(SuretyError::InvalidProofTimestamp)?;
    let epoch_day =
        u16::try_from(epoch_day).map_err(|_| error!(SuretyError::InvalidProofTimestamp))?;
    Ok(Pubkey::find_program_address(
        &[txline::DAILY_ODDS_SEED, &epoch_day.to_le_bytes()],
        &txline::PROGRAM_ID,
    )
    .0)
}

fn integer_predicate(operator: u8, threshold: i32) -> Result<TraderPredicate> {
    let (comparison, adjusted) = match operator {
        0 => (Comparison::EqualTo, threshold),
        1 => (Comparison::GreaterThan, threshold),
        2 => (
            Comparison::GreaterThan,
            threshold
                .checked_sub(1)
                .ok_or(SuretyError::SettlementPredicateMismatch)?,
        ),
        3 => (Comparison::LessThan, threshold),
        4 => (
            Comparison::LessThan,
            threshold
                .checked_add(1)
                .ok_or(SuretyError::SettlementPredicateMismatch)?,
        ),
        _ => return err!(SuretyError::SettlementPredicateMismatch),
    };
    Ok(TraderPredicate {
        threshold: adjusted,
        comparison,
    })
}

fn direct_stat_key(field_id: u8) -> Option<u32> {
    match field_id {
        1..=8 => Some(u32::from(field_id)),
        _ => None,
    }
}

fn total_stat_keys(field_id: u8) -> Option<(u32, u32)> {
    match field_id {
        9 => Some((1, 2)),
        10 => Some((3, 4)),
        11 => Some((5, 6)),
        12 => Some((7, 8)),
        _ => None,
    }
}

fn require_leaf(payload: &StatValidationInput, index: usize, key: u32) -> Result<u8> {
    let leaf = payload
        .stats
        .get(index)
        .ok_or_else(|| error!(SuretyError::SettlementPredicateMismatch))?;
    require!(
        leaf.stat.key == key,
        SuretyError::SettlementPredicateMismatch
    );
    require!(
        leaf.stat.period == txline::FINAL_PERIOD,
        SuretyError::SettlementNotFinal
    );
    u8::try_from(index).map_err(|_| error!(SuretyError::SettlementPredicateMismatch))
}

fn strategy_for_policy(
    predicate_bytes: &[u8],
    payload: &StatValidationInput,
) -> Result<NDimensionalStrategy> {
    require!(
        predicate_bytes.len() >= 17 && predicate_bytes[0] == 1,
        SuretyError::SettlementPredicateMismatch
    );
    let clause_count = usize::from(predicate_bytes[1]);
    require!(
        (1..=2).contains(&clause_count) && predicate_bytes.len() == 2 + clause_count * 15,
        SuretyError::SettlementPredicateMismatch
    );

    let fixture_id = u64::try_from(payload.fixture_summary.fixture_id)
        .map_err(|_| error!(SuretyError::SettlementPredicateMismatch))?;
    let mut stat_index = 0usize;
    let mut predicates = Vec::with_capacity(clause_count);
    for clause_index in 0..clause_count {
        let start = 2 + clause_index * 15;
        let clause = &predicate_bytes[start..start + 15];
        let clause_fixture = u64::from_le_bytes(
            clause[1..9]
                .try_into()
                .map_err(|_| error!(SuretyError::SettlementPredicateMismatch))?,
        );
        require!(
            clause_fixture == fixture_id,
            SuretyError::SettlementPredicateMismatch
        );

        match clause[0] {
            1 => {
                let threshold = i32::from_le_bytes(
                    clause[11..15]
                        .try_into()
                        .map_err(|_| error!(SuretyError::SettlementPredicateMismatch))?,
                );
                let predicate = integer_predicate(clause[10], threshold)?;
                if let Some(key) = direct_stat_key(clause[9]) {
                    let index = require_leaf(payload, stat_index, key)?;
                    predicates.push(StatPredicate::Single { index, predicate });
                    stat_index += 1;
                } else if let Some((key_a, key_b)) = total_stat_keys(clause[9]) {
                    let index_a = require_leaf(payload, stat_index, key_a)?;
                    let index_b = require_leaf(payload, stat_index + 1, key_b)?;
                    predicates.push(StatPredicate::Binary {
                        index_a,
                        index_b,
                        op: BinaryExpression::Add,
                        predicate,
                    });
                    stat_index += 2;
                } else {
                    return err!(SuretyError::SettlementPredicateMismatch);
                }
            }
            2 => {
                require!(
                    clause[9] == 0 && clause[10] == 0 && clause[12..15] == [0, 0, 0],
                    SuretyError::SettlementPredicateMismatch
                );
                let comparison = match clause[11] {
                    0 => Comparison::GreaterThan,
                    1 => Comparison::EqualTo,
                    2 => Comparison::LessThan,
                    _ => return err!(SuretyError::SettlementPredicateMismatch),
                };
                let index_a = require_leaf(payload, stat_index, 1)?;
                let index_b = require_leaf(payload, stat_index + 1, 2)?;
                predicates.push(StatPredicate::Binary {
                    index_a,
                    index_b,
                    op: BinaryExpression::Subtract,
                    predicate: TraderPredicate {
                        threshold: 0,
                        comparison,
                    },
                });
                stat_index += 2;
            }
            _ => return err!(SuretyError::SettlementPredicateMismatch),
        }
    }
    require!(
        stat_index == payload.stats.len(),
        SuretyError::SettlementPredicateMismatch
    );

    Ok(NDimensionalStrategy {
        geometric_targets: Vec::new(),
        distance_predicate: None,
        discrete_predicates: predicates,
    })
}

fn attestation_hash(args: &PostAttestationArgs) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(21 + 8 + 32 * 3 + 8 * 5);
    bytes.extend_from_slice(ATTESTATION_DOMAIN);
    bytes.extend_from_slice(&args.seq.to_le_bytes());
    bytes.extend_from_slice(&args.prev_hash);
    bytes.extend_from_slice(&args.odds_packet_hash);
    bytes.extend_from_slice(&args.book_snapshot_hash);
    bytes.extend_from_slice(&args.reserves.to_le_bytes());
    bytes.extend_from_slice(&args.locked_collateral.to_le_bytes());
    bytes.extend_from_slice(&args.marked_liabilities.to_le_bytes());
    bytes.extend_from_slice(&args.solvency_ratio_bps.to_le_bytes());
    bytes.extend_from_slice(&args.observed_at_ms.to_le_bytes());
    hash(&bytes).to_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    fn final_payload(keys: &[u32]) -> StatValidationInput {
        StatValidationInput {
            ts: 1_783_717_433_523,
            fixture_summary: txline::ScoresBatchSummary {
                fixture_id: 18_218_149,
                update_stats: txline::ScoresUpdateStats {
                    update_count: 1,
                    min_timestamp: 1_783_717_433_523,
                    max_timestamp: 1_783_717_433_523,
                },
                events_sub_tree_root: [0; 32],
            },
            fixture_proof: Vec::new(),
            main_tree_proof: Vec::new(),
            event_stat_root: [0; 32],
            stats: keys
                .iter()
                .map(|key| txline::StatLeaf {
                    stat: txline::ScoreStat {
                        key: *key,
                        value: 0,
                        period: txline::FINAL_PERIOD,
                    },
                    stat_proof: Vec::new(),
                })
                .collect(),
        }
    }

    #[test]
    fn share_math_rounds_against_withdrawing_lp() {
        assert_eq!(deposit_shares(100, 0, 0).unwrap(), 100);
        assert_eq!(deposit_shares(50, 125, 100).unwrap(), 40);
        assert_eq!(withdrawal_assets(40, 175, 140).unwrap(), 50);
        assert_eq!(deposit_shares(1, 10_000, 1).unwrap(), 0);
    }

    #[test]
    fn hard_bucket_cap_is_deterministic() {
        assert_eq!(bucket_cap(1_000_000, 2_000).unwrap(), 200_000);
        assert_eq!(bucket_cap(999, 2_000).unwrap(), 199);
    }

    #[test]
    fn withdrawal_unlocks_at_next_boundary() {
        assert_eq!(next_epoch(96, 48).unwrap(), 144);
        assert_eq!(next_epoch(97, 48).unwrap(), 144);
    }

    #[test]
    fn outcome_policy_derives_two_stat_subtraction() {
        let canonical = [1, 1, 2, 165, 252, 21, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let strategy = strategy_for_policy(&canonical, &final_payload(&[1, 2])).unwrap();
        assert_eq!(
            strategy.discrete_predicates,
            vec![StatPredicate::Binary {
                index_a: 0,
                index_b: 1,
                op: BinaryExpression::Subtract,
                predicate: TraderPredicate {
                    threshold: 0,
                    comparison: Comparison::GreaterThan,
                },
            }]
        );
    }

    #[test]
    fn policy_cannot_settle_with_different_stat_keys_or_nonfinal_leaves() {
        let canonical = [1, 1, 2, 165, 252, 21, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        assert!(strategy_for_policy(&canonical, &final_payload(&[7, 8])).is_err());
        let mut in_running = final_payload(&[1, 2]);
        in_running.stats[0].stat.period = 1;
        assert!(strategy_for_policy(&canonical, &in_running).is_err());
    }

    #[test]
    fn authentic_txline_prices_normalize_exactly() {
        // Exact full-match 1X2 prices from authentic fixture 18237038 message
        // 1837782566:00003:000791-10021-stab.
        let prices = [2784, 2968, 3291];
        assert_eq!(normalized_probability_ppm(prices, 0).unwrap(), 359_202);
        assert_eq!(normalized_probability_ppm(prices, 1).unwrap(), 336_933);
        assert_eq!(normalized_probability_ppm(prices, 2).unwrap(), 303_865);
        assert_eq!(
            validated_quote_terms(1_000_000_000, 2_000, 0, 50_000_000, 15_000, prices, 0).unwrap(),
            (359_202, 26_940_150)
        );
        assert!(validated_quote_terms(
            1_000_000_000,
            2_000,
            150_000_000,
            50_000_000,
            15_000,
            prices,
            0,
        )
        .is_err());
    }

    #[test]
    fn validated_odds_must_match_the_policy_fixture_and_outcome() {
        let fixture_id = 18_237_038i64;
        let mut predicate_bytes = [0u8; MAX_PREDICATE_BYTES];
        predicate_bytes[0] = 1;
        predicate_bytes[1] = 1;
        predicate_bytes[2] = 2;
        predicate_bytes[3..11].copy_from_slice(&(fixture_id as u64).to_le_bytes());
        predicate_bytes[13] = 2;
        let args = IssuePolicyArgs {
            nonce: 1,
            predicate_len: 17,
            predicate_bytes,
            predicate_hash: hash(&predicate_bytes[..17]).to_bytes(),
            quote_hash: [0; 32],
            bucket_hash: [1; 32],
            payout_authority: Pubkey::new_unique(),
            coverage: 100_000_000,
            premium: 1,
            expires_at: i64::MAX,
        };
        assert_eq!(policy_outcome_index(&args, fixture_id).unwrap(), 2);
        assert!(policy_outcome_index(&args, fixture_id + 1).is_err());
    }

    #[test]
    fn verified_quote_hash_matches_the_typescript_vector() {
        let fixture_id = 18_237_038u64;
        let mut predicate_bytes = [0u8; MAX_PREDICATE_BYTES];
        predicate_bytes[0] = 1;
        predicate_bytes[1] = 1;
        predicate_bytes[2] = 2;
        predicate_bytes[3..11].copy_from_slice(&fixture_id.to_le_bytes());
        let predicate_hash = hash(&predicate_bytes[..17]).to_bytes();
        let bucket_hash = hash(b"match:18237038:WIN_HOME").to_bytes();
        let args = IssuePolicyArgs {
            nonce: 1,
            predicate_len: 17,
            predicate_bytes,
            predicate_hash,
            quote_hash: [0; 32],
            bucket_hash,
            payout_authority: Pubkey::new_unique(),
            coverage: 50_000_000,
            premium: 26_940_150,
            expires_at: i64::MAX,
        };
        let message_hash = hash(b"1837782566:00003:000791-10021-stab").to_bytes();
        let validated_odds =
            Pubkey::find_program_address(&[b"validated_odds", &message_hash[..16]], &crate::ID).0;
        assert_eq!(
            verified_quote_hash(
                Pubkey::from_str("CDyQxhDHsaWYNBvjJgGPVFZdsBD3mC28VEX5DkCZkqEC").unwrap(),
                validated_odds,
                359_202,
                &args,
                [4; 32],
            ),
            [
                105, 195, 53, 200, 72, 205, 194, 2, 195, 16, 240, 143, 47, 168, 114, 153, 229, 108,
                240, 135, 61, 158, 23, 18, 172, 13, 71, 96, 148, 112, 215, 121,
            ]
        );
    }
}
