import "./lib/env.mjs";
import { searchSafeListingsByRegion, fetchRecentlySoldByRegion } from "./lib/myauction.mjs";
import { getServiceClient } from "./lib/supabase.mjs";
import { requireEnv } from "./lib/env.mjs";
import { geocodeMissing } from "./geocode.mjs";

const triggerType =
  process.argv.includes("--manual") || process.env.GITHUB_EVENT_NAME === "workflow_dispatch"
    ? "manual"
    : "scheduled";

async function main() {
  const supabase = getServiceClient();
  const startedAt = new Date();

  const { data: regions, error: regionsErr } = await supabase
    .from("interest_regions")
    .select("sido_code, sido_name, sigungu_code, sigungu_name");
  if (regionsErr) throw regionsErr;

  if (!regions.length) {
    console.log("등록된 관심지역이 없습니다. 설정 화면에서 지역을 먼저 추가하세요.");
    await supabase.from("sync_logs").insert({
      run_at: startedAt.toISOString(),
      trigger_type: triggerType,
      status: "성공",
      new_count: 0,
      updated_count: 0,
      removed_count: 0,
    });
    return;
  }

  const credentials = {
    id: requireEnv("MYAUCTION_ID"),
    password: requireEnv("MYAUCTION_PASSWORD"),
  };

  let scraped = [];
  let totalExcluded = 0;
  try {
    for (const region of regions) {
      console.log(`[${region.sido_name} ${region.sigungu_name}] 검색 중...`);
      const { records, excludedByKeywordCheck } = await searchSafeListingsByRegion({
        ...credentials,
        sidoCode: region.sido_code,
        sigunguCode: region.sigungu_code,
      });
      console.log(
        `[${region.sido_name} ${region.sigungu_name}] 안전 물건 ${records.length}건 (2차 확인에서 추가 제외 ${excludedByKeywordCheck}건)`
      );
      scraped.push(...records);
      totalExcluded += excludedByKeywordCheck;
    }
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

  // 같은 물건이 여러 지역 검색에 겹쳐 나올 수 있으므로 사건번호로 중복 제거.
  const uniqueByCaseNo = new Map(scraped.map((r) => [r.case_no, r]));
  scraped = Array.from(uniqueByCaseNo.values());

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
      winning_bid: rec.winning_bid,
      failed_count: rec.failed_count,
      sale_date: rec.sale_date,
      status: rec.status,
      building_area: rec.building_area,
      land_area: rec.land_area,
      myauction_url: rec.myauction_url,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("properties")
      .upsert(payload, { onConflict: "case_no" });
    if (upsertErr) throw upsertErr;

    if (!prev) {
      newCount++;
    } else if (prev.status !== rec.status || prev.min_sale_price !== rec.min_sale_price) {
      updatedCount++;
    }
  }

  const removedCount = existing.filter((r) => !scrapedCaseNos.has(r.case_no)).length;

  // 매각 완료 사건은 팔린 다음날부터 위 검색 창(오늘~3개월)에서 벗어나므로,
  // 이미 추적 중인 사건 한정으로 과거 매각 이력을 따로 조회해 낙찰가를 채운다.
  let soldUpdated = 0;
  try {
    console.log("최근 매각 완료 물건 낙찰가 확인 중...");
    for (const region of regions) {
      const sold = await fetchRecentlySoldByRegion({
        ...credentials,
        sidoCode: region.sido_code,
        sigunguCode: region.sigungu_code,
      });
      for (const rec of sold) {
        if (!existingByCase.has(rec.case_no) || !rec.winning_bid) continue;
        const { error: updErr } = await supabase
          .from("properties")
          .update({
            status: rec.status,
            min_sale_price: rec.min_sale_price,
            winning_bid: rec.winning_bid,
            updated_at: new Date().toISOString(),
          })
          .eq("case_no", rec.case_no);
        if (updErr) throw updErr;
        soldUpdated++;
      }
    }
  } catch (err) {
    console.error("낙찰가 갱신 단계 실패 (동기화 자체는 유지):", err);
  }

  const geo = await geocodeMissing(supabase).catch((err) => {
    console.error("지오코딩 단계 실패 (동기화 자체는 유지):", err);
    return { total: 0, ok: 0, failed: [] };
  });

  await supabase.from("sync_logs").insert({
    run_at: startedAt.toISOString(),
    trigger_type: triggerType,
    status: "성공",
    new_count: newCount,
    updated_count: updatedCount,
    removed_count: removedCount,
  });

  console.log(
    `동기화 완료 — 지역 ${regions.length}곳, 안전 물건 총 ${scraped.length}건 (신규 ${newCount}, 변경 ${updatedCount}, 더 이상 안 보임 ${removedCount}, 위험요소로 제외 ${totalExcluded}건), 낙찰가 갱신 ${soldUpdated}건, 지오코딩 ${geo.ok}/${geo.total}건`
  );
}

await main();
