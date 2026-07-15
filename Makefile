.PHONY: record replay marker verify-chain verify-phase1 verify-phase2 verify-phase3 verify

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

verify-chain:
	npm run marker -- --verify-chain data/attestations.jsonl

verify: verify-phase1 verify-phase2 verify-phase3 verify-chain
	@echo "PASS: SURETY verification gates completed"
