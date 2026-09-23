// 页面展示用的格式化小工具（不属于判定逻辑）

export function formatLimit(limit: number | null): string {
  if (limit === null) return "不适用";
  return limit.toLocaleString("zh-CN");
}

export function formatCount(count: number): string {
  return count.toLocaleString("zh-CN");
}

/** yyyy-mm-ddTHH:mm → mm-dd HH:mm */
export function formatStamp(stamp: string): string {
  const match = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(stamp);
  if (!match) return stamp;
  return `${match[1]}-${match[2]} ${match[3]}:${match[4]}`;
}

/** yyyy-mm-ddTHH:mm → yyyy-mm-dd */
export function stampDate(stamp: string): string {
  return stamp.slice(0, 10);
}
