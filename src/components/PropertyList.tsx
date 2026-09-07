"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PropertyWithMeta } from "@/lib/supabase";
import { dDay, formatEok, statusBadgeClass } from "@/lib/format";

type SortKey = "sale_date" | "discount" | "appraisal_value" | "collected_at";

function region(address: string | null): string {
  if (!address) return "기타";
  return address.split(" ")[0] ?? "기타";
}

function discountRate(p: PropertyWithMeta): number {
  if (!p.appraisal_value || !p.min_sale_price) return 0;
  return 1 - p.min_sale_price / p.appraisal_value;
}

export default function PropertyList({ properties }: { properties: PropertyWithMeta[] }) {
  const [regionFilter, setRegionFilter] = useState("전체");
  const [typeFilter, setTypeFilter] = useState("전체");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [sortKey, setSortKey] = useState<SortKey>("sale_date");

  const regions = useMemo(
    () => ["전체", ...Array.from(new Set(properties.map((p) => region(p.address_jibun)))).sort()],
    [properties]
  );
  const types = useMemo(
    () => ["전체", ...Array.from(new Set(properties.map((p) => p.property_type).filter(Boolean) as string[]))],
    [properties]
  );
  const statuses = useMemo(
    () => ["전체", ...Array.from(new Set(properties.map((p) => p.status).filter(Boolean) as string[]))],
    [properties]
  );

  const filtered = useMemo(() => {
    return properties
      .filter((p) => regionFilter === "전체" || region(p.address_jibun) === regionFilter)
      .filter((p) => typeFilter === "전체" || p.property_type === typeFilter)
      .filter((p) => statusFilter === "전체" || p.status === statusFilter)
      .sort((a, b) => {
        switch (sortKey) {
          case "discount":
            return discountRate(b) - discountRate(a);
          case "appraisal_value":
            return (b.appraisal_value ?? 0) - (a.appraisal_value ?? 0);
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
  }, [properties, regionFilter, typeFilter, statusFilter, sortKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <Select label="지역" value={regionFilter} onChange={setRegionFilter} options={regions} />
        <Select label="물건종류" value={typeFilter} onChange={setTypeFilter} options={types} />
        <Select label="상태" value={statusFilter} onChange={setStatusFilter} options={statuses} />
        <Select
          label="정렬"
          value={sortKey}
          onChange={(v) => setSortKey(v as SortKey)}
          options={["sale_date", "discount", "appraisal_value", "collected_at"]}
          labels={{
            sale_date: "매각기일 임박순",
            discount: "저감율 높은순",
            appraisal_value: "감정가 높은순",
            collected_at: "최근 수집순",
          }}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
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
              return (
                <tr
                  key={p.id}
                  className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 ${
                    urgent ? "bg-amber-50/70" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-neutral-500">
                    <Link href={p.myauction_url ?? "#"} target="_blank" className="hover:underline">
                      {p.case_no}
                    </Link>
                    <div className="text-neutral-400">{p.court}</div>
                  </td>
                  <td className="max-w-[260px] px-4 py-3">{p.address_jibun}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{p.property_type}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{formatEok(p.appraisal_value)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap font-medium text-amber-700">
                    {formatEok(p.min_sale_price)}
                    {p.failed_count > 0 && (
                      <div className="text-xs font-normal text-neutral-400">유찰 {p.failed_count}회</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(p.status)}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{p.sale_date}</div>
                    <div className={`text-xs ${urgent ? "font-semibold text-amber-700" : "text-neutral-400"}`}>
                      {dday.label}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-neutral-500">
                    {p.user_meta?.priority_tag ?? "관심"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-neutral-400">
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
