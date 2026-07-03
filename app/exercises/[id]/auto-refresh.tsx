"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** AI採点待ちの間だけ画面を自動更新する（固定待機ではなく状態で制御する） */
export function AutoRefresh({
  active,
  intervalMs = 1200,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);

  return null;
}
