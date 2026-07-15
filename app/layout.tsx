import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SURETY — Glass Balance Sheet",
  description: "On-chain solvency, continuously marked from TxLINE consensus odds.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
