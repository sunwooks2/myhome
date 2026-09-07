"use client";

import { useState } from "react";
import type { SyncLog } from "@/lib/supabase";

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.round(hr / 24)}일 전`;
}

export default function SyncPanel({ lastSync }: { lastSync: SyncLog | null }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function trigger() {
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "요청 실패");
      setState("done");
      setMessage("GitHub Actions에 동기화를 요청했습니다. 1~2분 후 새로고침 해주세요.");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "요청 실패");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-neutral-500">
          {lastSync ? (
            <>
              마지막 동기화: {timeAgo(lastSync.run_at)}
              {lastSync.status === "성공" ? (
                <span className="ml-1 text-neutral-400">
                  (신규 {lastSync.new_count} · 변경 {lastSync.updated_count})
                </span>
              ) : (
                <span className="ml-1 text-red-600">실패</span>
              )}
            </>
          ) : (
            "동기화 이력 없음"
          )}
        </span>
        <button
          onClick={trigger}
          disabled={state === "loading"}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {state === "loading" ? "요청 중..." : "지금 동기화"}
        </button>
      </div>
      {message && (
        <span className={state === "error" ? "text-red-600" : "text-emerald-700"}>{message}</span>
      )}
    </div>
  );
}
