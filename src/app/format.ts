// 展示用格式化工具（纯函数）

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function fmtDate(day: string): string {
  if (!day) return "—";
  const [y, m, d] = day.split("-");
  return `${y}-${m}-${d}`;
}

/** 距校准到期天数（负数表示已过期） */
export function daysUntil(day: string, now: Date): number | null {
  if (!day) return null;
  const due = new Date(`${day}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** datetime-local 默认值 */
export function nowLocalInput(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours()
  )}:${pad(now.getMinutes())}`;
}

export function todayInput(): string {
  return nowLocalInput(new Date()).slice(0, 10);
}
