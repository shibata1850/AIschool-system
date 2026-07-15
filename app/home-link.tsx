"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * ホーム以外の画面で「ホームにもどる」導線を常時表示する（生徒の迷子防止）。
 * ホーム（/）では表示しない。LTI起動時もCanvas内で機能する。
 */
export function HomeLink() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <Link href="/" className="home-back">
      ← ホームにもどる
    </Link>
  );
}
