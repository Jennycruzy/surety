# `txline-cpi`

Settle against TxLINE from your Anchor program in one CPI.

```sh
cargo add txline-cpi
```

```rust
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke};
use txline_cpi::{PROGRAM_ID, VALIDATE_STAT_V2_DISCRIMINATOR, ValidateStatV2Args};

let mut data = VALIDATE_STAT_V2_DISCRIMINATOR.to_vec();
ValidateStatV2Args { payload: &payload, strategy: &strategy }
    .serialize(&mut data)?;
invoke(
    &Instruction {
        program_id: PROGRAM_ID,
        accounts: vec![AccountMeta::new_readonly(daily_scores_root.key(), false)],
        data,
    },
    &[daily_scores_root.to_account_info(), txline_program.to_account_info()],
)?;
```

The caller must derive the correct daily root, bound proof sizes, check TxLINE ownership,
and verify that return data came from `PROGRAM_ID`. See `examples/validate_stat.rs` for
the complete helper. The types are pinned to TxLINE devnet IDL v1.5.6.

Extracted from SURETY during the TxODDS World Cup Hackathon and released under MIT.
