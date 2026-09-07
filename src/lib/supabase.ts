import { createClient } from "@supabase/supabase-js";

// Server-only: uses the service_role key, which bypasses RLS. Never import
// this from a "use client" component — Next.js would refuse to inline the
// secret into the browser bundle anyway since it's not NEXT_PUBLIC_-prefixed,
// but keep the boundary explicit.
export function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export type Property = {
  id: string;
  case_no: string;
  court: string | null;
  address_road: string | null;
  address_jibun: string | null;
  lat: number | null;
  lng: number | null;
  property_type: string | null;
  appraisal_value: number | null;
  min_sale_price: number | null;
  failed_count: number;
  sale_date: string | null;
  status: string | null;
  land_area: number | null;
  building_area: number | null;
  exclusive_area: number | null;
  floor_info: string | null;
  tenant_summary: string | null;
  rights_note: string | null;
  myauction_url: string | null;
  site_tags: string[];
  registered_at: string | null;
  collected_at: string;
  updated_at: string;
};

export type UserMeta = {
  property_id: string;
  priority_tag: string;
  memo: string | null;
  target_bid_price: number | null;
};

export type PropertyWithMeta = Property & { user_meta: UserMeta | null };

export type SyncLog = {
  id: string;
  run_at: string;
  trigger_type: string;
  status: string;
  new_count: number;
  updated_count: number;
  removed_count: number;
  error_message: string | null;
};

export async function fetchLatestSyncLog(): Promise<SyncLog | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sync_logs")
    .select("*")
    .order("run_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchPropertiesWithMeta(): Promise<PropertyWithMeta[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("properties")
    .select("*, user_meta(*)")
    .order("sale_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    user_meta: Array.isArray(row.user_meta) ? row.user_meta[0] ?? null : row.user_meta,
  })) as PropertyWithMeta[];
}
