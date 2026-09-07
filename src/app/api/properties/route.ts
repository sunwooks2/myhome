import { NextResponse } from "next/server";
import { fetchPropertiesWithMeta } from "@/lib/supabase";

export async function GET() {
  const properties = await fetchPropertiesWithMeta();
  return NextResponse.json(properties);
}
