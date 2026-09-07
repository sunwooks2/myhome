import "./lib/env.mjs";
import { requireEnv } from "./lib/env.mjs";
import { getServiceClient } from "./lib/supabase.mjs";

const KAKAO_KEY = requireEnv("KAKAO_REST_API_KEY");

async function geocode(address) {
  const url = `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
  if (!res.ok) throw new Error(`Kakao geocoding failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  const doc = body.documents?.[0];
  if (!doc) return null;
  return { lat: parseFloat(doc.y), lng: parseFloat(doc.x) };
}

// Auction addresses are often "동/호수" detail that trips up exact address matching
// (e.g. "...휴앤하임 5층502호"). Strip everything from the building name's trailing
// floor/unit info onward and retry once if the full string doesn't match.
function simplify(address) {
  return address.replace(/\s*\S*\d+동\s*/g, " ").replace(/\d+층\d*호?$/, "").trim();
}

async function main() {
  const supabase = getServiceClient();
  const { data: rows, error } = await supabase
    .from("properties")
    .select("id, address_jibun")
    .is("lat", null)
    .not("address_jibun", "is", null);
  if (error) throw error;

  console.log(`좌표 없는 물건 ${rows.length}건 지오코딩 시작`);
  let ok = 0;
  let failed = [];

  for (const row of rows) {
    let coord = await geocode(row.address_jibun);
    if (!coord) coord = await geocode(simplify(row.address_jibun));

    if (coord) {
      const { error: updErr } = await supabase
        .from("properties")
        .update({ lat: coord.lat, lng: coord.lng })
        .eq("id", row.id);
      if (updErr) throw updErr;
      ok++;
    } else {
      failed.push(row.address_jibun);
    }
    await new Promise((r) => setTimeout(r, 120)); // be polite to Kakao's rate limit
  }

  console.log(`성공 ${ok}건 / 실패 ${failed.length}건`);
  if (failed.length) {
    console.log("지오코딩 실패 주소 (수동 확인 필요):");
    failed.forEach((a) => console.log(" -", a));
  }
}

await main();
