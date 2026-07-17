use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke,
};
use txline_cpi::{
    NDimensionalStrategy, StatValidationInput, ValidateStatV2Args, PROGRAM_ID,
    VALIDATE_STAT_V2_DISCRIMINATOR,
};

pub fn validate_stat<'info>(
    root: &AccountInfo<'info>,
    txline_program: &AccountInfo<'info>,
    payload: &StatValidationInput,
    strategy: &NDimensionalStrategy,
) -> Result<()> {
    require_keys_eq!(*root.owner, PROGRAM_ID);
    let mut data = VALIDATE_STAT_V2_DISCRIMINATOR.to_vec();
    ValidateStatV2Args { payload, strategy }.serialize(&mut data)?;
    invoke(
        &Instruction {
            program_id: PROGRAM_ID,
            accounts: vec![AccountMeta::new_readonly(root.key(), false)],
            data,
        },
        &[root.clone(), txline_program.clone()],
    )?;
    Ok(())
}

fn main() {}
