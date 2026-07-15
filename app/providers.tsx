"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useMemo, type ReactNode } from "react";
import { RPC_ENDPOINT } from "./lib/config.js";

// No adapter packages are wired in on purpose: every wallet worth supporting
// (Phantom, Solflare, Backpack, ...) publishes itself via the Wallet Standard and
// is auto-detected by WalletProvider with an empty `wallets` list.
export default function Providers({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
