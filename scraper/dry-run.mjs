import "./lib/env.mjs";
import { searchSafeListingsByRegion } from "./lib/myauction.mjs";

const [sidoCode, sigunguCode] = process.argv.slice(2);
if (!sidoCode || !sigunguCode) {
  console.error("사용법: node scraper/dry-run.mjs <시도코드> <시군구코드>  (예: node scraper/dry-run.mjs 3 365)");
  process.exit(1);
}

const { records, excludedByKeywordCheck } = await searchSafeListingsByRegion({
  id: process.env.MYAUCTION_ID,
  password: process.env.MYAUCTION_PASSWORD,
  sidoCode,
  sigunguCode,
});

console.log(`안전 물건 ${records.length}건 (2차 확인에서 추가 제외 ${excludedByKeywordCheck}건)\n`);
console.log(JSON.stringify(records, null, 2));
