import { NextRequest, NextResponse } from "next/server";

const BASE = "http://www.my-auction.co.kr";

// 마이옥션 검색 폼의 시/군/구 드롭다운이 내부적으로 호출하는 비공개 AJAX
// 엔드포인트를 그대로 사용한다. XHR로 온 요청이라는 표시(Referer +
// X-Requested-With)가 없으면 거부되고, 응답은 간단한 XML이라 정규식으로 파싱한다.
export async function GET(request: NextRequest) {
  const sido = request.nextUrl.searchParams.get("sido");
  if (!sido) {
    return NextResponse.json({ error: "sido 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const res = await fetch(`${BASE}/auction/addressSearch.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: `${BASE}/auction/search.php`,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: `address1_01=${encodeURIComponent(sido)}&address1_02=`,
  });

  if (!res.ok) {
    return NextResponse.json({ error: "마이옥션 지역 조회 실패" }, { status: 502 });
  }

  const xml = await res.text();
  const items = Array.from(xml.matchAll(/<item>\s*<addr_name>(.*?)<\/addr_name>\s*<addr_code>(.*?)<\/addr_code>\s*<\/item>/g)).map(
    (m) => ({ code: m[2].trim(), name: m[1].trim() })
  );

  return NextResponse.json(items);
}
