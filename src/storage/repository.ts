import { emptyState } from "../domain/workflow";
import type { StationState } from "../domain/types";

// —— 本地存储层：仅依赖领域模型，负责 localStorage 读写与结构校验 ——

const STORAGE_KEY = "hxwl09-particle-station-v1";

export function loadState(): StationState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StationState>;
    if (
      !parsed ||
      typeof parsed.seq !== "number" ||
      !Array.isArray(parsed.samples) ||
      !Array.isArray(parsed.exceptions) ||
      !Array.isArray(parsed.releases) ||
      !parsed.rooms ||
      typeof parsed.rooms !== "object"
    ) {
      return null;
    }
    // 以当前资料为基准合并房间运行态，资料扩充后旧存档仍可用
    const base = emptyState();
    const rooms = { ...base.rooms };
    for (const roomId of Object.keys(rooms)) {
      const saved = (parsed.rooms as Record<string, unknown>)[roomId];
      if (saved && typeof saved === "object") {
        rooms[roomId] = { ...rooms[roomId], ...(saved as object) };
      }
    }
    const maxSeq = Math.max(
      0,
      ...parsed.samples.map((sample) => sample.seq ?? 0),
      ...parsed.exceptions.map((ticket) => ticket.seq ?? 0),
      ...parsed.releases.map((release) => release.seq ?? 0)
    );
    return {
      seq: Math.max(parsed.seq, maxSeq),
      samples: parsed.samples,
      exceptions: parsed.exceptions,
      releases: parsed.releases,
      rooms,
    };
  } catch {
    return null;
  }
}

export function saveState(state: StationState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默失败，页面内状态仍可用
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 忽略
  }
}
