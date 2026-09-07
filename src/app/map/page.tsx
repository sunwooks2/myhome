import { fetchPropertiesWithMeta } from "@/lib/supabase";
import MapView from "@/components/MapView";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const properties = await fetchPropertiesWithMeta();
  return <MapView properties={properties} />;
}
