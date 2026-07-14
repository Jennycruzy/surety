.PHONY: record replay verify-phase1 verify-phase2

record:
	npm run record -- --duration 300

replay:
	npm run replay -- --log data/recordings/phase0-18237038-odds.raw.sse

verify-phase1:
	npm run test:phase1
	npm run replay -- --log data/recordings/phase0-18237038-odds.raw.sse --verify-identical

verify-phase2:
	npm test grammar
