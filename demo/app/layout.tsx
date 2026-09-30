import { Lock } from "lucide-react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { PreviewPane, PreviewProvider } from "@/components/preview";
import { Avatar } from "@/components/ui";
import { getDb } from "@/lib/db";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = { title: "Shortlist" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const openJobs = (db.prepare("SELECT count(*) AS n FROM jobs WHERE status = 'open'").get() as { n: number }).n;
  const pool = (db.prepare("SELECT count(*) AS n FROM candidates").get() as { n: number }).n;
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <PreviewProvider>
          <div className="shell">
            <aside className="side">
              <div className="brand">
                <span className="brand-mark">S</span>Shortlist
              </div>
              <Nav openJobs={openJobs} pool={pool} />
              <div className="workspace" title="Private workspace. Only you can see these candidates.">
                <Avatar name="Alex Rivera" size={28} />
                <div>
                  <div className="ws-name">Rivera Talent</div>
                  <div className="ws-sub">
                    <Lock size={11} /> Alex Rivera · Private
                  </div>
                </div>
              </div>
            </aside>
            <main className="main">{children}</main>
            <Suspense>
              <PreviewPane />
            </Suspense>
          </div>
        </PreviewProvider>
      </body>
    </html>
  );
}
