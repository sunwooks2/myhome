import "./lib/env.mjs";
import { scrapeInterestList } from "./lib/myauction.mjs";
import { getServiceClient } from "./lib/supabase.mjs";
import { requireEnv } from "./lib/env.mjs";

const triggerType = process.argv.includes("--manual") ? "manual" : "scheduled";

async function main() {
  const supabase = getServiceClient();
  const startedAt = new Date();

  let scraped;
  try {
    scraped = await scrapeInterestList({
      id: requireEnv("MYAUCTION_ID"),
      password: requireEnv("MYAUCTION_PASSWORD"),
    });
  } catch (err) {
    await supabase.from("sync_logs").insert({
      run_at: startedAt.toISOString(),
      trigger_type: triggerType,
      status: "실패",
      error_message: String(err.message || err),
    });
    console.error("스크래핑 실패:", err);
    process.exitCode = 1;
    return;
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("properties")
    .select("id, case_no, status, min_sale_price");
  if (fetchErr) throw fetchErr;

  const existingByCase = new Map(existing.map((r) => [r.case_no, r]));
  const scrapedCaseNos = new Set(scraped.map((r) => r.case_no));

  let newCount = 0;
  let updatedCount = 0;

  for (const rec of scraped) {
    const prev = existingByCase.get(rec.case_no);
    const payload = {
      case_no: rec.case_no,
      court: rec.court,
      address_jibun: rec.address_jibun,
      property_type: rec.property_type,
      appraisal_value: rec.appraisal_value,
      min_sale_price: rec.min_sale_price,
      failed_count: rec.failed_count,
      sale_date: rec.sale_date,
      status: rec.status,
      building_area: rec.building_area,
      land_area: rec.land_area,
      myauction_url: rec.myauction_url,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error: upsertErr } = await supabase
      .from("properties")
      .upsert(payload, { onConflict: "case_no" })
      .select("id")
      .single();
    if (upsertErr) throw upsertErr;

    if (!prev) {
      newCount++;
      await supabase.from("user_meta").upsert(
        { property_id: upserted.id, priority_tag: "관심" },
        { onConflict: "property_id" }
      );
    } else if (prev.status !== rec.status || prev.min_sale_price !== rec.min_sale_price) {
      updatedCount++;
    }
  }

  const removedCount = existing.filter((r) => !scrapedCaseNos.has(r.case_no)).length;

  await supabase.from("sync_logs").insert({
    run_at: startedAt.toISOString(),
    trigger_type: triggerType,
    status: "성공",
    new_count: newCount,
    updated_count: updatedCount,
    removed_count: removedCount,
  });

  console.log(
    `동기화 완료 — 총 ${scraped.length}건 (신규 ${newCount}, 변경 ${updatedCount}, 마이옥션에서 사라짐 ${removedCount})`
  );
}

await main();
