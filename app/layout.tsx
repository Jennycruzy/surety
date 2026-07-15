import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import Providers from "./providers.js";

export const metadata: Metadata = {
  title: "SURETY — Glass Balance Sheet",
  description: "On-chain solvency, continuously marked from TxLINE consensus odds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers>{children}</Providers></body></html>;
}
