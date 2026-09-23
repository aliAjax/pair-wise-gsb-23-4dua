// 时间工具：统一输出本地日期/时间字符串，保证词法比较与显示一致。

export function localDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function localStamp(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${localDate(d)}T${hh}:${mm}`;
}

export function addDays(date: string, offset: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + offset);
  return localDate(d);
}

export function stampAt(date: string, hh: number, mm: number): string {
  return `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
