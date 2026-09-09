"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { InterestRegion } from "@/lib/supabase";

const SIDO_LIST = [
  { code: "10", name: "서울특별시" },
  { code: "3", name: "경기도" },
  { code: "12", name: "인천광역시" },
  { code: "2", name: "강원도" },
  { code: "16", name: "충청남도" },
  { code: "8", name: "대전광역시" },
  { code: "17", name: "충청북도" },
  { code: "18", name: "세종시" },
  { code: "9", name: "부산광역시" },
  { code: "11", name: "울산광역시" },
  { code: "7", name: "대구광역시" },
  { code: "5", name: "경상북도" },
  { code: "4", name: "경상남도" },
  { code: "6", name: "광주/전남" },
  { code: "14", name: "전라북도" },
  { code: "15", name: "제주도" },
];

type SigunguOption = { code: string; name: string };

export default function RegionManager({ regions }: { regions: InterestRegion[] }) {
  const router = useRouter();
  const [sido, setSido] = useState("");
  const [sigunguOptions, setSigunguOptions] = useState<SigunguOption[]>([]);
  const [fetchedForSido, setFetchedForSido] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingSigungu = sido !== "" && fetchedForSido !== sido;

  useEffect(() => {
    if (!sido) return;
    let cancelled = false;
    fetch(`/api/regions/sigungu?sido=${sido}`)
      .then((res) => res.json())
      .then((data: SigunguOption[]) => {
        if (cancelled) return;
        setSigunguOptions(data);
        setFetchedForSido(sido);
      })
      .catch(() => {
        if (!cancelled) setError("시/군/구 목록을 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
    };
  }, [sido]);

  function handleSidoChange(value: string) {
    setSido(value);
    setSigungu("");
    setSigunguOptions([]);
  }

  async function addRegion() {
    if (!sido || !sigungu) return;
    setAdding(true);
    setError(null);
    try {
      const sidoName = SIDO_LIST.find((s) => s.code === sido)?.name ?? sido;
      const sigunguName = sigunguOptions.find((s) => s.code === sigungu)?.name ?? sigungu;
      const res = await fetch("/api/regions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sido_code: sido,
          sido_name: sidoName,
          sigungu_code: sigungu,
          sigungu_name: sigunguName,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "추가 실패");
      setSigungu("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "추가 실패");
    } finally {
      setAdding(false);
    }
  }

  async function removeRegion(id: string) {
    await fetch(`/api/regions/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          시/도
          <select
            className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
            value={sido}
            onChange={(e) => handleSidoChange(e.target.value)}
          >
            <option value="">선택</option>
            {SIDO_LIST.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-neutral-600">
          시/군/구
          <select
            className="min-w-[140px] rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:bg-neutral-100"
            value={sigungu}
            onChange={(e) => setSigungu(e.target.value)}
            disabled={!sido || loadingSigungu}
          >
            <option value="">{loadingSigungu ? "불러오는 중..." : "선택"}</option>
            {sigunguOptions.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={addRegion}
          disabled={!sido || !sigungu || adding}
          className="rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {adding ? "추가 중..." : "관심지역 추가"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {regions.length === 0 && (
          <p className="text-sm text-neutral-400">등록된 관심지역이 없습니다. 위에서 지역을 추가하세요.</p>
        )}
        {regions.map((r) => (
          <span
            key={r.id}
            className="flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700"
          >
            {r.sido_name} {r.sigungu_name}
            <button
              onClick={() => removeRegion(r.id)}
              className="text-neutral-400 hover:text-red-600"
              aria-label={`${r.sido_name} ${r.sigungu_name} 삭제`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
