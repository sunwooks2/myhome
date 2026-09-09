import { fetchLatestSyncLog, fetchPropertiesWithMeta } from "@/lib/supabase";
import { dDay } from "@/lib/format";
import PropertyList from "@/components/PropertyList";
import SyncPanel from "@/components/SyncPanel";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [properties, lastSync] = await Promise.all([
    fetchPropertiesWithMeta(),
    fetchLatestSyncLog(),
  ]);

  const total = properties.length;
  const favoriteCount = properties.filter((p) => p.is_favorite).length;
  const thisWeek = properties.filter((p) => {
    const { days } = dDay(p.sale_date);
    return days != null && days >= 0 && days <= 7;
  }).length;
  const newest = properties.filter((p) => {
    const collected = new Date(p.collected_at).getTime();
    return Date.now() - collected < 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-xl font-semibold">관심지역 안전물건</h1>
        <SyncPanel lastSync={lastSync} />
      </div>
      <div className="mt-4 grid grid-cols-4 gap-4 sm:max-w-2xl">
        <SummaryCard label="전체 후보물건" value={`${total}건`} />
        <SummaryCard label="관심물건" value={`${favoriteCount}건`} />
        <SummaryCard label="이번 주 매각" value={`${thisWeek}건`} accent={thisWeek > 0} />
        <SummaryCard label="24시간 내 신규" value={`${newest}건`} />
      </div>

      <div className="mt-6">
        <PropertyList properties={properties} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? "text-amber-700" : "text-neutral-900"}`}>{value}</div>
    </div>
  );
}
