import { chromium } from "playwright";

const BASE = "http://www.my-auction.co.kr";
const PYEONG_TO_SQM = 3.305785;
const ROWS_PER_PAGE = 100;
const MAX_PAGES = 40; // safety cap per region/category (up to 4,000 listings) — 전체 광역시 검색도 잘리지 않도록 여유를 둠

// 초보자 안전 필터 — 사용자와 합의한 "표준 리스크 세트". 마이옥션 검색 폼의
// 특수물건 체크박스 값과 그대로 매칭된다.
//
// 원래는 이 값들을 전부 spe_age에 실어 speand2=snot(체크항목제외검색)으로
// 한 번에 요청하면 서버가 알아서 빼줄 거라 생각했는데, 실측해보니 "유치권/
// 법정지상권/분묘기지권/대지권미등기"를 제외검색에 넣으면 (단독으로 넣어도)
// 전체 결과가 거의 0건으로 무너지는 사이트 쪽 버그가 있었다 (인천 전체 기준
// 2,438건 중 이 넷 중 하나만 제외해도 3건으로 붕괴, 반면 대항력/지분 등은
// 정상 동작). 그래서 제외검색에 기대지 않고, 카테고리별로 "포함검색"
// (speand1=AND)을 따로 돌려 사건번호를 모은 뒤 우리가 직접 차집합을 낸다.
const STANDARD_RISK_SPE = [
  "유치권",
  "법정지상권",
  "분묘기지권",
  "지분",
  "토지지분매각",
  "선순위전세권_전세권",
  "대항력",
  "대지권미등기",
];

// 서버 측 제외가 정상 동작했는지 확인하는 2차 방어선. 목록에 이미 표시되는
// "특수권리" 텍스트에 아래 키워드가 하나라도 남아 있으면 안전하지 않다고 보고 버린다.
const RISK_KEYWORDS = [
  "대항력",
  "유치권",
  "법정지상권",
  "분묘기지권",
  "지분매각",
  "토지지분매각",
  "선순위전세권",
  "대지권미등기",
];

// CI runners occasionally see a one-off connect/TLS stall against this host
// (saw the same thing locally once, succeeded on the very next attempt), so
// retry navigation a few times before giving up.
async function gotoWithRetry(page, url, attempts = 3, options = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000, ...options });
      return;
    } catch (err) {
      lastErr = err;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw lastErr;
}

async function login(page, { id, password }) {
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
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// 실제 브라우저가 검색 폼 제출 시 만들어내는 쿼리스트링을 그대로 재현한다.
// 필드를 임의로 빼면 사이트의 프론트 검증 스크립트가 "error2" 얼럿을 띄우고
// 검색을 막기 때문에, 값이 비어 있는 항목도 전부 명시적으로 채워 보낸다.
//
// riskCategory를 주면 그 항목 하나만 "포함검색"(체크항목AND검색)한다 —
// 위 주석에서 설명한 제외검색 버그를 피하기 위해 항상 포함검색만 쓴다.
function buildSearchUrl({ sidoCode, sigunguCode, page, riskCategory }) {
  const today = new Date();
  const in3Months = new Date(today);
  in3Months.setMonth(in3Months.getMonth() + 3);

  const params = new URLSearchParams({
    page: String(page),
    stc: "1",
    aresult: "",
    charge_no: "",
    usage_code_all: "",
    acourt: "",
    office: "",
    sno: "",
    tno: "",
    npls: "N",
    spels: "Y",
    schs: "N",
    pchs: "N",
    listds: "",
    ipdate1: fmtDate(today),
    ipdate2: fmtDate(in3Months),
    eprice1: "0",
    eprice2: "0",
    mprice1: "0",
    mprice2: "0",
    viewType: "",
    auction_cate: "",
    catelist: "",
    subNum: "",
    subDis: "",
    apoint1: "0",
    apoint2: "0",
    buildingtxt: "",
    address1_01: sidoCode,
    address1_02: sigunguCode,
    address1_03: "",
    aorder: "1",
    option1: "",
    option2: "",
    lastidxin: "",
    barea1: "",
    barea2: "",
    larea1: "",
    larea2: "",
    speand1: riskCategory ? "sand" : "",
    speand2: "",
    spe_age: riskCategory ?? "",
    gm_age: "",
    np1: "",
    np2: "",
    rows: String(ROWS_PER_PAGE),
  });
  return `${BASE}/auction/search_list.php?${params.toString()}`;
}

async function scrapeListPage(page) {
  return page.$$eval("table.tbl_auction_list tbody tr", (rows) =>
    rows
      .filter((tr) => tr.querySelector("td") && !tr.querySelector("th"))
      .map((tr) => {
        const tds = tr.querySelectorAll("td");
        const get = (i) => (tds[i] ? tds[i].innerText.trim() : "");

        const detailLink =
          tds[1]?.querySelector("a")?.getAttribute("href") ||
          tds[3]?.querySelector("a")?.getAttribute("href") ||
          null;

        const typeCourtLines = get(2).split("\n").map((s) => s.trim()).filter(Boolean);
        const [property_type, case_no, court] = typeCourtLines;

        const addrCell = tds[3];
        const address = addrCell?.querySelector("ul > li:first-child a")?.textContent.trim() || "";
        const areaText = addrCell?.querySelector("ul > li:nth-child(2) p")?.textContent || "";
        const riskText = addrCell?.querySelector(".refer")?.textContent.trim() || "";

        const priceCell = tds[4];
        const priceLines = get(4).split("\n").map((s) => s.trim()).filter(Boolean);
        const appraisal_value = priceLines[0] || null;
        const min_sale_price = priceLines[1] || null;
        // 매각(낙찰)된 사건만 감정가/최저가 아래에 낙찰가가 분홍색(span.pink)으로 따로 표시된다.
        const winning_bid = priceCell?.querySelector("span.pink")?.textContent.trim() || null;

        const statusLines = get(5).split("\n").map((s) => s.trim()).filter(Boolean);
        const status_raw = statusLines.join(" ");

        const saleLines = get(6).split("\n").map((s) => s.trim()).filter(Boolean);
        const sale_date = saleLines[0] || null;

        return {
          detail_path: detailLink,
          property_type,
          case_no,
          court,
          address,
          area_text: areaText,
          risk_text: riskText,
          appraisal_value_raw: appraisal_value,
          min_sale_price_raw: min_sale_price,
          winning_bid_raw: winning_bid,
          status_raw,
          sale_date_raw: sale_date,
        };
      })
  );
}

// 페이지를 넘겨가며 목록을 전부 긁는다. urlForPage(n)이 만든 주소로 이동해
// 행이 0건이거나(끝) 한 페이지 분량(ROWS_PER_PAGE)보다 적게 나오면 멈춘다.
// dialogState는 호출자가 페이지에 등록해 둔 dialog 리스너와 공유하는 참조칸이다.
async function scrapeAllPages(page, urlForPage, dialogState) {
  const collected = [];

  for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
    dialogState.message = null;
    await gotoWithRetry(page, urlForPage(pageNum), 3, { referer: `${BASE}/auction/search.php` });
    await page.waitForTimeout(400);

    const rows = await scrapeListPage(page);
    if (rows.length === 0) {
      if (dialogState.message) {
        throw new Error(`마이옥션 검색 요청이 거부됨: ${dialogState.message}`);
      }
      break;
    }
    collected.push(...rows);
    if (rows.length < ROWS_PER_PAGE) break;
  }
  return collected;
}

/**
 * 등록된 관심지역(시/도 + 시/군/구) 기준으로 마이옥션 종합검색을 수행하고,
 * 대항력임차인·유치권 등 표준 리스크 세트에 해당하는 물건을 제외한 안전한
 * 물건만 반환한다. 로그인 세션이 있어야 검색 결과 열람이 가능하다.
 *
 * 위험 물건 판정은 (a) 리스크 카테고리별 "포함검색" 결과의 사건번호 합집합과
 * (b) 목록에 이미 표시되는 "특수권리" 텍스트에 위험 키워드가 있는지, 둘을
 * 함께 본다. (제외검색을 한 번에 쓰지 않는 이유는 위 STANDARD_RISK_SPE
 * 주석 참고.)
 */
export async function searchSafeListingsByRegion({ id, password, sidoCode, sigunguCode }) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    const dialogState = { message: null };
    page.on("dialog", async (dialog) => {
      dialogState.message = dialog.message();
      await dialog.dismiss().catch(() => {});
    });
    await login(page, { id, password });

    const baseline = await scrapeAllPages(
      page,
      (pageNum) => buildSearchUrl({ sidoCode, sigunguCode, page: pageNum }),
      dialogState
    );

    const riskyCaseNos = new Set();
    for (const category of STANDARD_RISK_SPE) {
      const rows = await scrapeAllPages(
        page,
        (pageNum) => buildSearchUrl({ sidoCode, sigunguCode, page: pageNum, riskCategory: category }),
        dialogState
      );
      for (const r of rows) riskyCaseNos.add(r.case_no);
    }

    const safe = baseline.filter(
      (r) => !riskyCaseNos.has(r.case_no) && !RISK_KEYWORDS.some((k) => r.risk_text.includes(k))
    );

    return {
      records: safe.map(normalize),
      excludedByKeywordCheck: baseline.length - safe.length,
    };
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
  // e.g. "유찰 3회 (34%)", "매각 (입찰1위) (72%)", "재진행 1회 (70%)", "신건 (100%)"
  const failedMatch = statusRaw.match(/(?:유찰|재진행)\s*(\d+)\s*회/);
  let status = "진행중";
  if (/매각/.test(statusRaw)) status = "매각";
  else if (/취하/.test(statusRaw)) status = "취하";
  else if (/기각/.test(statusRaw)) status = "기각";
  else if (/변경/.test(statusRaw)) status = "변경";
  else if (/정지/.test(statusRaw)) status = "정지";
  else if (/유찰|재진행/.test(statusRaw)) status = "유찰";
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
    winning_bid: toNumber(r.winning_bid_raw),
    failed_count,
    sale_date: parseSaleDate(r.sale_date_raw),
    status,
    building_area,
    land_area,
    myauction_url: r.detail_path ? new URL(r.detail_path, BASE).toString() : null,
  };
}
