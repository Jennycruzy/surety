import type { NextConfig } from "next";

// Server components and server actions read authentic capture files at request time
// (recorded odds snapshot, the TxLINE settlement proof, the attestation chain, and the
// program IDL). On serverless hosts these must be traced into the function bundle.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**": [
      "./data/recordings/**",
      "./data/attestations-gate6.jsonl",
      "./target/idl/**",
    ],
  },
};

export default nextConfig;
