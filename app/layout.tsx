import type { Metadata } from "next";
import Link from "next/link";
import { HomeLink } from "./home-link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next Gen AI School",
  description: "Next Gen AI School 学習システム",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-header__inner">
              {/* ブランドは見出し(role=heading)にしない: 画面ごとのh1と役割を分ける */}
              <Link href="/" className="brand">
                <span className="brand__mark" aria-hidden>
                  ◆
                </span>
                <span className="brand__name">Next Gen AI School</span>
              </Link>
              <HomeLink />
            </div>
          </header>
          {children}
          <footer className="app-footer">
            <div className="app-footer__inner">
              <span>Next Gen AI School 学習システム（開発中のプレビュー）</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
