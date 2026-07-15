.PHONY: record replay marker verify-chain verify-phase1 verify-phase2 verify-phase3 verify-phase4 verify-phase5 verify-phase6 verify

SOLANA_PATH := $(HOME)/.local/share/solana/install/active_release/bin
CARGO_PATH := $(HOME)/.cargo/bin
TOOLCHAIN_PATH := $(CARGO_PATH):$(SOLANA_PATH):$(PATH)

record:
	npm run record -- --duration 300

replay:
	npm run replay -- --log data/recordings/phase0-18237038-odds.raw.sse

verify-phase1:
	npm run test:phase1
	npm run replay -- --log data/recordings/phase0-18237038-odds.raw.sse --verify-identical

verify-phase2:
	npm test grammar

verify-phase3:
	PATH="$(TOOLCHAIN_PATH)" cargo test -p surety_core --lib
	PATH="$(TOOLCHAIN_PATH)" anchor build
	PATH="$(TOOLCHAIN_PATH)" anchor test --skip-build --provider.cluster localnet --validator legacy

verify-phase4:
	PATH="$(TOOLCHAIN_PATH)" npm run test:phase4

verify-phase5:
	npm run test:phase5
	PATH="$(TOOLCHAIN_PATH)" npm run audit-quote -- --log data/quotes/gate5-quotes.jsonl --rpc https://api.devnet.solana.com

verify-phase6:
	npm run test:phase6
	npm run marker -- --verify-chain data/attestations-gate6.jsonl --rpc https://api.devnet.solana.com

verify-chain:
	npm run marker -- --verify-chain data/attestations-gate6.jsonl --rpc https://api.devnet.solana.com

verify: verify-phase1 verify-phase2 verify-phase3 verify-chain
	@echo "PASS: SURETY verification gates completed"
