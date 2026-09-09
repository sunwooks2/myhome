import { fetchInterestRegions } from "@/lib/supabase";
import RegionManager from "@/components/RegionManager";

export const dynamic = "force-dynamic";

export default async function RegionSettingsPage() {
  const regions = await fetchInterestRegions();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-semibold">관심지역 설정</h1>
      <p className="mt-2 text-sm text-neutral-500">
        등록한 시/군/구를 기준으로 매일 안전 물건(대항력임차인·유치권 등 위험 요소를 제외한 물건)만 자동으로 수집합니다.
      </p>
      <div className="mt-6">
        <RegionManager regions={regions} />
      </div>
    </div>
  );
}
