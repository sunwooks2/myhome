"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PropertyWithMeta } from "@/lib/supabase";
import { dDay, formatEok, statusBadgeClass } from "@/lib/format";

async function toggleFavorite(id: string, next: boolean) {
  await fetch(`/api/properties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_favorite: next }),
  });
}

type SortKey =
  | "sale_date"
  | "discount"
  | "appraisal_desc"
  | "appraisal_asc"
  | "min_price_desc"
  | "min_price_asc"
  | "collected_at";

// 이 상태가 되면 더 이상 입찰이 불가능한 사건이다 — 목록에서 취소선으로 표시한다.
const UNBIDDABLE_STATUSES = new Set(["매각", "취하", "기각"]);

function region(address: string | null): string {
  if (!address) return "기타";
  return address.split(" ")[0] ?? "기타";
}

function discountRate(p: PropertyWithMeta): number {
  if (!p.appraisal_value || !p.min_sale_price) return 0;
  return 1 - p.min_sale_price / p.appraisal_value;
}

export default function PropertyList({ properties: initialProperties }: { properties: PropertyWithMeta[] }) {
  const [properties, setProperties] = useState(initialProperties);
  const [regionFilters, setRegionFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("sale_date");

  function handleToggleFavorite(p: PropertyWithMeta) {
    const next = !p.is_favorite;
    setProperties((prev) => prev.map((row) => (row.id === p.id ? { ...row, is_favorite: next } : row)));
    toggleFavorite(p.id, next);
  }

  const regions = useMemo(
    () => Array.from(new Set(properties.map((p) => region(p.address_jibun)))).sort(),
    [properties]
  );
  const types = useMemo(
    () => Array.from(new Set(properties.map((p) => p.property_type).filter(Boolean) as string[])).sort(),
    [properties]
  );
  const statuses = useMemo(
    () => Array.from(new Set(properties.map((p) => p.status).filter(Boolean) as string[])).sort(),
    [properties]
  );

  const filtered = useMemo(() => {
    return properties
      .filter((p) => regionFilters.length === 0 || regionFilters.includes(region(p.address_jibun)))
      .filter((p) => typeFilters.length === 0 || (p.property_type != null && typeFilters.includes(p.property_type)))
      .filter((p) => statusFilters.length === 0 || (p.status != null && statusFilters.includes(p.status)))
      .filter((p) => !favoritesOnly || p.is_favorite)
      .sort((a, b) => {
        switch (sortKey) {
          case "discount":
            return discountRate(b) - discountRate(a);
          case "appraisal_desc":
            return (b.appraisal_value ?? 0) - (a.appraisal_value ?? 0);
          case "appraisal_asc":
            return (a.appraisal_value ?? Infinity) - (b.appraisal_value ?? Infinity);
          case "min_price_desc":
            return (b.min_sale_price ?? 0) - (a.min_sale_price ?? 0);
          case "min_price_asc":
            return (a.min_sale_price ?? Infinity) - (b.min_sale_price ?? Infinity);
          case "collected_at":
            return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime();
          case "sale_date":
          default: {
            const at = a.sale_date ? new Date(a.sale_date).getTime() : Infinity;
            const bt = b.sale_date ? new Date(b.sale_date).getTime() : Infinity;
            return at - bt;
          }
        }
      });
  }, [properties, regionFilters, typeFilters, statusFilters, favoritesOnly, sortKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <CheckboxGroup label="지역" options={regions} selected={regionFilters} onChange={setRegionFilters} />
        <CheckboxGroup label="물건종류" options={types} selected={typeFilters} onChange={setTypeFilters} />
        <CheckboxGroup label="상태" options={statuses} selected={statusFilters} onChange={setStatusFilters} />
        <Select
          label="정렬"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={[
            "sale_date",
            "discount",
            "appraisal_desc",
            "appraisal_asc",
            "min_price_desc",
            "min_price_asc",
            "collected_at",
          ]}
          labels={{
            sale_date: "매각기일 임박순",
            discount: "저감율 높은순",
            appraisal_desc: "감정가 높은순",
            appraisal_asc: "감정가 낮은순",
            min_price_desc: "최저가 높은순",
            min_price_asc: "최저가 낮은순",
            collected_at: "최근 수집순",
          }}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input
            type="checkbox"
            checked={favoritesOnly}
            onChange={(e) => setFavoritesOnly(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          관심물건만 보기
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3">사건번호</th>
              <th className="px-4 py-3">소재지</th>
              <th className="px-4 py-3">종류</th>
              <th className="px-4 py-3 text-right">감정가</th>
              <th className="px-4 py-3 text-right">최저가</th>
              <th className="px-4 py-3">상태</th>
              <th className="px-4 py-3">매각기일</th>
              <th className="px-4 py-3">우선순위</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => {
              const dday = dDay(p.sale_date);
              const urgent = dday.days != null && dday.days >= 0 && dday.days <= 7;
              const unbiddable = p.status != null && UNBIDDABLE_STATUSES.has(p.status);
              const strike = unbiddable ? "line-through decoration-neutral-400" : "";
              return (
                <tr
                  key={p.id}
                  className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                    urgent ? "bg-amber-50/70" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleFavorite(p)}
                      aria-label={p.is_favorite ? "관심물건 해제" : "관심물건으로 등록"}
                      className={`text-lg ${p.is_favorite ? "text-amber-500" : "text-neutral-300 hover:text-amber-400"}`}
                    >
                      {p.is_favorite ? "★" : "☆"}
                    </button>
                  </td>
                  <td className={`px-4 py-3 font-mono text-xs text-neutral-500 ${strike}`}>
                    <Link href={p.myauction_url ?? "#"} target="_blank" className="hover:underline">
                      {p.case_no}
                    </Link>
                    <div className="text-neutral-400">{p.court}</div>
                  </td>
                  <td className={`max-w-[260px] px-4 py-3 ${strike}`}>{p.address_jibun}</td>
                  <td className={`px-4 py-3 whitespace-nowrap ${strike}`}>{p.property_type}</td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap ${strike}`}>
                    {formatEok(p.appraisal_value)}
                  </td>
                  <td className={`px-4 py-3 text-right whitespace-nowrap font-medium text-amber-700 ${strike}`}>
                    {formatEok(p.min_sale_price)}
                    {p.status === "매각" && p.winning_bid ? (
                      <div className="text-xs font-normal text-emerald-700">낙찰 {formatEok(p.winning_bid)}</div>
                    ) : (
                      p.failed_count > 0 && (
                        <div className="text-xs font-normal text-neutral-400">유찰 {p.failed_count}회</div>
                      )
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${strike}`}>
                    <div>{p.sale_date}</div>
                    <div className={`text-xs ${urgent ? "font-semibold text-amber-700" : "text-neutral-400"}`}>
                      {dday.label}
                    </div>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap text-neutral-500 ${strike}`}>
                    {p.user_meta?.priority_tag ?? "-"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-neutral-400">
                  조건에 맞는 물건이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
        {label}
        {selected.length > 0 && <span className="text-amber-700"> ({selected.length})</span>}
      </summary>
      <div className="absolute z-20 mt-1 flex max-h-60 min-w-[160px] flex-col gap-0.5 overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
        {options.length === 0 && <span className="px-2 py-1 text-sm text-neutral-400">항목 없음</span>}
        {options.map((o) => (
          <label
            key={o}
            className="flex items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => toggle(o)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            {o}
          </label>
        ))}
      </div>
    </details>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      {label}
      <select
        className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  );
}
