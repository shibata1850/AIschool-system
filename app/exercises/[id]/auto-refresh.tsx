"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * AI採点待ちの間だけ画面を自動更新する（固定待機ではなく状態で制御する）。
 * 採点が長引く場合は上限回数で停止し、案内を表示する
 * （無限ポーリング防止 — 2026-07-03 夜間レビュー指摘#4）。
 */
export function AutoRefresh({
  active,
  intervalMs = 1200,
  maxAttempts = 25,
}: {
  active: boolean;
  intervalMs?: number;
  maxAttempts?: number;
}) {
  const router = useRouter();
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    if (!active) {
      setExhausted(false);
      return;
    }
    let count = 0;
    const timer = setInterval(() => {
      count += 1;
      if (count > maxAttempts) {
        clearInterval(timer);
        setExhausted(true);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, maxAttempts, router]);

  if (!active || !exhausted) return null;
  return (
    <p role="alert" style={{ color: "var(--warn)" }}>
      採点に時間がかかっています。しばらくしてから画面を開き直すか、先生に知らせてください
    </p>
  );
}
