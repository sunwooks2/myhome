import "./lib/env.mjs";
import { scrapeInterestList } from "./lib/myauction.mjs";

const records = await scrapeInterestList({
  id: process.env.MYAUCTION_ID,
  password: process.env.MYAUCTION_PASSWORD,
});

console.log(`총 ${records.length}건 파싱됨\n`);
console.log(JSON.stringify(records, null, 2));
