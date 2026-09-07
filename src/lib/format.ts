export function formatWon(value: number | null): string {
  if (value == null) return "-";
  return `${value.toLocaleString("ko-KR")}원`;
}

export function formatEok(value: number | null): string {
  if (value == null) return "-";
  const eok = value / 100_000_000;
  if (eok >= 1) return `${eok.toFixed(eok >= 10 ? 0 : 1)}억`;
  return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만`;
}

export function dDay(saleDate: string | null): { label: string; days: number | null } {
  if (!saleDate) return { label: "-", days: null };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(saleDate);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return { label: "D-Day", days };
  if (days > 0) return { label: `D-${days}`, days };
  return { label: `종료 (${-days}일 전)`, days };
}

const STATUS_STYLE: Record<string, string> = {
  진행중: "bg-slate-100 text-slate-700",
  유찰: "bg-amber-100 text-amber-800",
  매각: "bg-emerald-100 text-emerald-800",
  취하: "bg-neutral-200 text-neutral-600",
  기각: "bg-neutral-200 text-neutral-600",
  변경: "bg-sky-100 text-sky-800",
  정지: "bg-neutral-200 text-neutral-600",
};

export function statusBadgeClass(status: string | null): string {
  return STATUS_STYLE[status ?? ""] ?? "bg-slate-100 text-slate-700";
}
