import { chromium } from "playwright";

const BASE = "http://www.my-auction.co.kr";
const PYEONG_TO_SQM = 3.305785;

// CI runners occasionally see a one-off connect/TLS stall against this host
// (saw the same thing locally once, succeeded on the very next attempt), so
// retry navigation a few times before giving up.
async function gotoWithRetry(page, url, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

/**
 * Logs into my-auction.co.kr and scrapes every page of "나의 관심물건" (My interested properties).
 * Returns an array of normalized property records ready to upsert into `properties`.
 */
export async function scrapeInterestList({ id, password }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });

    await gotoWithRetry(page, `${BASE}/member/login.php`);
    await page.fill("#id", id);
    await page.fill("#passwd", password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null),
      page.click("#btn_login"),
    ]);
    await page.waitForTimeout(800);

    if (page.url().includes("login.php")) {
      throw new Error("마이옥션 로그인 실패 - 아이디/비밀번호를 확인하세요.");
    }

    // rows=100 pulls every item onto one page (the site defaults to 20/page).
    await gotoWithRetry(page, `${BASE}/mypage/my_list.php?rows=100`);
    await page.waitForTimeout(500);

    const records = await page.$$eval("table.tbl_auction_list tbody tr", (rows) =>
      rows
        .filter((tr) => tr.querySelector("td") && !tr.querySelector("th"))
        .map((tr) => {
          const tds = tr.querySelectorAll("td");
          const get = (i) => (tds[i] ? tds[i].innerText.trim() : "");

          const favIdInput = tr.querySelector('input[name="idBox"]');
          const fav_id = favIdInput ? favIdInput.value : null;

          const detailLink = tds[1]?.querySelector("a")?.getAttribute("href") || null;

          const typeCourtLines = get(2).split("\n").map((s) => s.trim()).filter(Boolean);
          const [property_type, case_no, court] = typeCourtLines;

          const addrCell = tds[3];
          const address = addrCell?.querySelector("a")?.textContent.trim() || "";
          const addrLines = addrCell ? addrCell.innerText.split("\n").map((s) => s.trim()).filter(Boolean) : [];
          const regulation_tags = addrLines.filter((l) => /^\[.*\]$/.test(l)).map((l) => l.slice(1, -1));

          const priceLines = get(4).split("\n").map((s) => s.trim()).filter(Boolean);
          const appraisal_value = priceLines[0] || null;
          const min_sale_price = priceLines[1] || null;

          const statusLines = get(5).split("\n").map((s) => s.trim()).filter(Boolean);
          const status_raw = statusLines.join(" ");

          const saleLines = get(6).split("\n").map((s) => s.trim()).filter(Boolean);
          const sale_date = saleLines[0] || null;

          return {
            fav_id,
            detail_path: detailLink,
            property_type,
            case_no,
            court,
            address,
            area_text: addrLines.find((l) => /건물|토지/.test(l)) || "",
            regulation_tags,
            appraisal_value_raw: appraisal_value,
            min_sale_price_raw: min_sale_price,
            status_raw,
            sale_date_raw: sale_date,
          };
        })
    );

    return records.map(normalize);
  } finally {
    await browser.close();
  }
}

function toNumber(raw) {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseArea(areaText) {
  const buildingMatch = areaText.match(/건물\s*([\d.]+)\s*평/);
  const landMatch = areaText.match(/토지\s*([\d.]+)\s*평/);
  const building = buildingMatch ? parseFloat(buildingMatch[1]) * PYEONG_TO_SQM : null;
  const land = landMatch ? parseFloat(landMatch[1]) * PYEONG_TO_SQM : null;
  return {
    building_area: building ? Math.round(building * 100) / 100 : null,
    land_area: land ? Math.round(land * 100) / 100 : null,
  };
}

function parseStatus(statusRaw) {
  // e.g. "유찰 3회 (34%)", "매각 (입찰1위) (72%)", "취하 2회 (49%)"
  const failedMatch = statusRaw.match(/유찰\s*(\d+)\s*회/);
  let status = "진행중";
  if (/매각/.test(statusRaw)) status = "매각";
  else if (/취하/.test(statusRaw)) status = "취하";
  else if (/기각/.test(statusRaw)) status = "기각";
  else if (/변경/.test(statusRaw)) status = "변경";
  else if (/정지/.test(statusRaw)) status = "정지";
  else if (/유찰/.test(statusRaw)) status = "유찰";
  return {
    status,
    failed_count: failedMatch ? parseInt(failedMatch[1], 10) : 0,
  };
}

function parseSaleDate(raw) {
  const m = raw && raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function normalize(r) {
  const { building_area, land_area } = parseArea(r.area_text);
  const { status, failed_count } = parseStatus(r.status_raw);
  return {
    case_no: r.case_no,
    court: r.court || null,
    address_road: null,
    address_jibun: r.address || null,
    property_type: r.property_type || null,
    appraisal_value: toNumber(r.appraisal_value_raw),
    min_sale_price: toNumber(r.min_sale_price_raw),
    failed_count,
    sale_date: parseSaleDate(r.sale_date_raw),
    status,
    building_area,
    land_area,
    myauction_url: r.detail_path ? new URL(r.detail_path, BASE).toString() : null,
    myauction_fav_id: r.fav_id,
    regulation_tags_raw: r.regulation_tags,
  };
}
