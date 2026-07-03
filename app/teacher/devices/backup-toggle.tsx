"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/postJson";

/** S9: 予備機切替ボタン（NearHubタッチ前提・44px以上） */
export function BackupToggle({
  seatNo,
  usingBackup,
}: {
  seatNo: number;
  usingBackup: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    setBusy(true);
    const result = await postJson(`/api/devices/${seatNo}/backup`, {
      usingBackup: !usingBackup,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={busy} onClick={toggle}>
        {usingBackup ? "GOOVISに戻す" : "予備機に切替"}
      </button>
      {error && (
        <p role="alert" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
