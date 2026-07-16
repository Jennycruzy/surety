import type { NextConfig } from "next";

// Server components and server actions read authentic capture files at request time
// (recorded odds snapshot, the TxLINE settlement proof, the attestation chain, and the
// program IDL). On serverless hosts these must be traced into the function bundle.
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**": [
      "./data/recordings/*-odds-snapshot.raw.json",
      "./data/recordings/phase0-18218149-seq1087-final-proof-v2.raw.json",
      "./data/attestations-gate6.jsonl",
      "./target/idl/surety_core.json",
    ],
  },
};

export default nextConfig;
