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

// 시/군/구를 아직 고르지 않은 상태를 나타내는 값. 마이옥션 검색에서는 빈
// 문자열("") 자체가 "이 시/도 전체"를 뜻하는 유효한 선택지라서, "아직 선택
// 안 함"과 구분하려면 별도의 값이 필요하다.
const UNSELECTED = "__unselected__";

// 마이옥션 목록에는 "부천시"(도시 전체)와 "부천시 소사구"(하위 구)가 함께
// 내려오지만, 인천 같은 광역시는 구만 내려오고 "전체" 항목 자체가 없다.
// 그래서 항상 "이 시/도 전체"(코드 "")를 맨 위에 추가하고, 하위 구가 딸린
// 도시(부천시 등)는 "(전체)"를 붙여 그 아래 구들과 구분되게 보여준다.
function annotateSigungu(options: SigunguOption[]): SigunguOption[] {
  const withLabel = options.map((o) => {
    const isWholeCity = options.some((other) => other.code !== o.code && other.name.startsWith(`${o.name} `));
    return isWholeCity ? { ...o, name: `${o.name} (전체)` } : o;
  });
  const sorted = withLabel.sort((a, b) => {
    const aWhole = a.name.endsWith("(전체)");
    const bWhole = b.name.endsWith("(전체)");
    if (aWhole !== bWhole) return aWhole ? -1 : 1;
    return a.name.localeCompare(b.name, "ko");
  });
  return [{ code: "", name: "전체" }, ...sorted];
}

export default function RegionManager({ regions }: { regions: InterestRegion[] }) {
  const router = useRouter();
  const [sido, setSido] = useState("");
  const [sigunguOptions, setSigunguOptions] = useState<SigunguOption[]>([]);
  const [fetchedForSido, setFetchedForSido] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState(UNSELECTED);
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
        setSigunguOptions(annotateSigungu(data));
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
    setSigungu(UNSELECTED);
    setSigunguOptions([]);
  }

  async function addRegion() {
    if (!sido || sigungu === UNSELECTED) return;
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
      setSigungu(UNSELECTED);
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
            <option value={UNSELECTED}>{loadingSigungu ? "불러오는 중..." : "선택"}</option>
            {sigunguOptions.map((s) => (
              <option key={s.code || "__all__"} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={addRegion}
          disabled={!sido || sigungu === UNSELECTED || adding}
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
