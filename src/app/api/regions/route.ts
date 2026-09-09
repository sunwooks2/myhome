import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("interest_regions")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { sido_code, sido_name, sigungu_code, sigungu_name } = body ?? {};

  if (!sido_code || !sido_name || !sigungu_code || !sigungu_name) {
    return NextResponse.json(
      { error: "sido_code, sido_name, sigungu_code, sigungu_name이 모두 필요합니다." },
      { status: 400 }
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("interest_regions")
    .insert({ sido_code, sido_name, sigungu_code, sigungu_name })
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data, { status: 201 });
}
