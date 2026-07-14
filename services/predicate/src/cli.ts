import { compilePredicate } from "./compiler.js";

const predicate = process.argv.slice(2).join(" ").trim();
if (!predicate) {
  console.error("Usage: npm run predicate -- 'outcome(18237038) == WIN_HOME'");
  process.exit(2);
}
try {
  const compiled = compilePredicate(predicate);
  console.log(`canonical: ${compiled.canonicalText}`);
  console.log(`bytes: ${Buffer.from(compiled.canonicalBytes).toString("hex")}`);
  console.log(`sha256: ${compiled.hash}`);
} catch (error) {
  console.error(`REJECT: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
