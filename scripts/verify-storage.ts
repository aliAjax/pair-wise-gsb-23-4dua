// 刷新一致性：localStorage 保存 → 重新加载，状态应逐字段一致
const store = new Map<string, string>();
(globalThis as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

import { saveState, loadState } from "../src/storage/repository";
import { buildDemoState } from "../src/domain/workflow";

const ctx = { now: "2026-09-23T12:00", today: "2026-09-23" };
const state = buildDemoState(ctx);
saveState(state);
const restored = loadState();

if (!restored) throw new Error("reload returned null");
const same =
  JSON.stringify(restored.samples) === JSON.stringify(state.samples) &&
  JSON.stringify(restored.exceptions) === JSON.stringify(state.exceptions) &&
  JSON.stringify(restored.releases) === JSON.stringify(state.releases) &&
  JSON.stringify(restored.rooms) === JSON.stringify(state.rooms) &&
  restored.seq === state.seq;

console.log(
  `samples=${restored.samples.length} exceptions=${restored.exceptions.length} releases=${restored.releases.length}`
);
console.log("CR-1201:", restored.rooms["CR-1201"].status, "| CR-2107:", restored.rooms["CR-2107"].status);
console.log("release versions:", restored.releases[0].versions.length);
console.log(same ? "PERSIST OK" : "PERSIST MISMATCH");
process.exit(same ? 0 : 1);
