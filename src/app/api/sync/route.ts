import { NextResponse } from "next/server";

const OWNER = "sunwooks2";
const REPO = "myhome";
const WORKFLOW_FILE = "sync.yml";

export async function POST() {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "GITHUB_DISPATCH_TOKEN이 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({ error: `GitHub Actions 실행 요청 실패: ${detail}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
