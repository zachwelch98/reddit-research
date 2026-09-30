import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Pain Point Miner", description: "Ranked business problems mined from Reddit" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/" className="brand">Pain Point Miner</Link>
          <Link href="/">Problems</Link>
          <Link href="/chat">Ask the data</Link>
          <Link href="/sql">SQL</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
