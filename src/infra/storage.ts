// 本地存储层：localStorage 的读写、校验与版本迁移，领域无感知

import { SCHEMA_VERSION, emptyState } from "../domain/store";
import type { PersistedState } from "../domain/types";

export const STORAGE_KEY = "hxwl-09.particle-release.v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/**
 * 校验持久化数据结构。只做形状级校验（业务一致性由判定层保证），
 * 损坏 / 版本不符时返回 null，由上层决定回退种子或空状态。
 */
export function parseState(raw: string): PersistedState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || parsed.schema !== SCHEMA_VERSION) return null;

    const counters = parsed.counters;
    if (
      !isObject(counters) ||
      typeof counters.sample !== "number" ||
      typeof counters.exception !== "number" ||
      typeof counters.release !== "number"
    ) {
      return null;
    }

    const stringLists = ["samples", "exceptions", "releases"] as const;
    for (const key of stringLists) {
      if (!Array.isArray(parsed[key])) return null;
    }
    if (!isObject(parsed.rooms)) return null;
    for (const room of Object.values(parsed.rooms)) {
      if (!isObject(room) || typeof room.roomId !== "string" || typeof room.status !== "string") {
        return null;
      }
    }

    // 关键字段抽检：采样单必须带房间号/判定结果
    if (
      (parsed.samples as unknown[]).some(
        (s) =>
          !isObject(s) ||
          typeof s.id !== "string" ||
          typeof s.roomId !== "string" ||
          typeof s.passed !== "boolean" ||
          !isStringArray(s.violations)
      )
    ) {
      return null;
    }

    return parsed as unknown as PersistedState;
  } catch {
    return null;
  }
}

export interface StorageAdapter {
  load: () => PersistedState | null;
  save: (state: PersistedState) => void;
  clear: () => void;
}

export function createStorage(storage?: Storage | null): StorageAdapter {
  const backend =
    storage ??
    (typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null);

  return {
    load() {
      if (!backend) return null;
      const raw = backend.getItem(STORAGE_KEY);
      return raw === null ? null : parseState(raw);
    },
    save(state) {
      try {
        backend?.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        // 存储已满 / 隐私模式：不影响当前会话，仅静默放弃持久化
      }
    },
    clear() {
      try {
        backend?.removeItem(STORAGE_KEY);
      } catch {
        // 忽略
      }
    },
  };
}

export function blankState(): PersistedState {
  return emptyState();
}
