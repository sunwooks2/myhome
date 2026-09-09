"use client";

import { useEffect, useRef, useState } from "react";
import type { PropertyWithMeta } from "@/lib/supabase";
import { dDay, formatEok, formatWon, statusBadgeClass } from "@/lib/format";

declare global {
  interface Window {
    kakao: any;
  }
}

type KakaoMarker = { setImage: (image: unknown) => void; setMap: (map: unknown) => void };

const STATUS_COLOR: Record<string, string> = {
  진행중: "#64748b",
  유찰: "#b45309",
  매각: "#047857",
  취하: "#737373",
  기각: "#737373",
  변경: "#0369a1",
  정지: "#737373",
};

function pinSvg(color: string, isFavorite: boolean) {
  const ring = isFavorite
    ? `<circle cx="13" cy="13" r="10.5" fill="none" stroke="#f59e0b" stroke-width="2.5"/>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="34" viewBox="0 0 26 34">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 9.3 13 21 13 21s13-11.7 13-21C26 5.8 20.2 0 13 0z" fill="${color}"/>
    ${ring}
    <circle cx="13" cy="13" r="5" fill="white"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function toggleFavorite(id: string, next: boolean) {
  await fetch(`/api/properties/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_favorite: next }),
  });
}

export default function MapView({ properties: initialProperties }: { properties: PropertyWithMeta[] }) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const [properties, setProperties] = useState(initialProperties);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const markersRef = useRef<Record<string, KakaoMarker>>({});
  const selected = properties.find((p) => p.id === selectedId) ?? null;

  function handleToggleFavorite(p: PropertyWithMeta) {
    const next = !p.is_favorite;
    setProperties((prev) => prev.map((row) => (row.id === p.id ? { ...row, is_favorite: next } : row)));
    toggleFavorite(p.id, next);

    const marker = markersRef.current[p.id];
    if (marker) {
      const color = STATUS_COLOR[p.status ?? ""] ?? "#64748b";
      marker.setImage(
        new window.kakao.maps.MarkerImage(pinSvg(color, next), new window.kakao.maps.Size(26, 34), {
          offset: new window.kakao.maps.Point(13, 34),
        })
      );
    }
  }

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
    const existing = document.getElementById("kakao-sdk") as HTMLScriptElement | null;

    function boot() {
      window.kakao.maps.load(() => setReady(true));
    }

    if (window.kakao?.maps) {
      boot();
      return;
    }
    if (existing) {
      existing.addEventListener("load", boot);
      return () => existing.removeEventListener("load", boot);
    }
    const script = document.createElement("script");
    script.id = "kakao-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false&libraries=clusterer`;
    script.async = true;
    script.addEventListener("load", boot);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !mapDivRef.current) return;
    const withCoords = initialProperties.filter((p) => p.lat != null && p.lng != null);
    if (withCoords.length === 0) return;

    const kakao = window.kakao;
    const center = new kakao.maps.LatLng(withCoords[0].lat, withCoords[0].lng);
    const map = new kakao.maps.Map(mapDivRef.current, { center, level: 8 });

    const markers = withCoords.map((p) => {
      const color = STATUS_COLOR[p.status ?? ""] ?? "#64748b";
      const position = new kakao.maps.LatLng(p.lat, p.lng);
      const marker = new kakao.maps.Marker({
        position,
        image: new kakao.maps.MarkerImage(pinSvg(color, p.is_favorite), new kakao.maps.Size(26, 34), {
          offset: new kakao.maps.Point(13, 34),
        }),
      });
      markersRef.current[p.id] = marker;

      const label = new kakao.maps.CustomOverlay({
        position,
        yAnchor: 2.5,
        content: `<div style="background:${color};color:#fff;font-size:11px;font-weight:600;padding:2px 6px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25);">${formatEok(
          p.min_sale_price
        )}</div>`,
      });
      label.setMap(map);

      kakao.maps.event.addListener(marker, "click", () => setSelectedId(p.id));
      return marker;
    });

    const clusterer = new kakao.maps.MarkerClusterer({
      map,
      markers,
      averageCenter: true,
      minLevel: 6,
    });

    const bounds = new kakao.maps.LatLngBounds();
    withCoords.forEach((p) => bounds.extend(new kakao.maps.LatLng(p.lat, p.lng)));
    map.setBounds(bounds);

    return () => {
      clusterer.clear();
      markers.forEach((m: any) => m.setMap(null));
      markersRef.current = {};
    };
  }, [ready, initialProperties]);

  return (
    <div className="relative isolate h-[calc(100vh-65px)] w-full">
      <div ref={mapDivRef} className="h-full w-full" />
      {selected && (
        <DetailSidebar
          property={selected}
          onClose={() => setSelectedId(null)}
          onToggleFavorite={() => handleToggleFavorite(selected)}
        />
      )}
    </div>
  );
}

function DetailSidebar({
  property,
  onClose,
  onToggleFavorite,
}: {
  property: PropertyWithMeta;
  onClose: () => void;
  onToggleFavorite: () => void;
}) {
  const dday = dDay(property.sale_date);
  const deposit = property.min_sale_price ? Math.round(property.min_sale_price * 0.1) : null;

  return (
    <aside className="absolute top-0 right-0 z-10 h-full w-[340px] overflow-y-auto border-l border-neutral-200 bg-white p-5 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-xs text-neutral-500">{property.case_no}</div>
          <div className="text-sm text-neutral-400">{property.court}</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleFavorite}
            aria-label={property.is_favorite ? "관심물건 해제" : "관심물건으로 등록"}
            className={`text-xl ${property.is_favorite ? "text-amber-500" : "text-neutral-300 hover:text-amber-400"}`}
          >
            {property.is_favorite ? "★" : "☆"}
          </button>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="닫기">
            ✕
          </button>
        </div>
      </div>

      <span className={`mt-3 inline-block rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(property.status)}`}>
        {property.status}
      </span>

      <h2 className="mt-3 text-base font-semibold leading-snug">{property.address_jibun}</h2>
      <p className="mt-1 text-sm text-neutral-500">{property.property_type}</p>

      <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-neutral-500">감정가</dt>
        <dd className="text-right font-medium">{formatWon(property.appraisal_value)}</dd>
        <dt className="text-neutral-500">최저매각가격</dt>
        <dd className="text-right font-medium text-amber-700">{formatWon(property.min_sale_price)}</dd>
        <dt className="text-neutral-500">매수신청보증금(10%)</dt>
        <dd className="text-right">{formatWon(deposit)}</dd>
        <dt className="text-neutral-500">유찰횟수</dt>
        <dd className="text-right">{property.failed_count}회</dd>
        <dt className="text-neutral-500">매각기일</dt>
        <dd className="text-right">
          {property.sale_date} <span className="text-neutral-400">({dday.label})</span>
        </dd>
        <dt className="text-neutral-500">건물면적</dt>
        <dd className="text-right">{property.building_area ? `${property.building_area}㎡` : "-"}</dd>
        <dt className="text-neutral-500">토지면적</dt>
        <dd className="text-right">{property.land_area ? `${property.land_area}㎡` : "-"}</dd>
      </dl>

      {property.site_tags?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {property.site_tags.map((tag) => (
            <span key={tag} className="rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-700">
              {tag}
            </span>
          ))}
        </div>
      )}

      {property.myauction_url && (
        <a
          href={property.myauction_url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block rounded-md border border-neutral-300 px-3 py-2 text-center text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          마이옥션에서 보기 ↗
        </a>
      )}
    </aside>
  );
}
