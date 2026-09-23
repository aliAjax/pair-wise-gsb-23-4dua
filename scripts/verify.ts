// 领域规则端到端验证（无测试框架，直接断言 + 退出码）
// 运行: npx esbuild scripts/verify.ts | node
import { createStorage } from "../src/infra/storage";
import { emptyState, getRoom, releaseRoom, submitSample, correctRelease } from "../src/domain/store";
import { buildSeedState } from "../src/domain/seed";
import type { SamplingFormValues } from "../src/domain/types";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  if (cond) {
    console.log(`  ok  ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${name} ${extra}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
}

const NOW = new Date("2026-09-23T10:00:00");
function f(p: Partial<SamplingFormValues>): SamplingFormValues {
  return {
    roomId: "CR-T1",
    isoClass: "ISO 5",
    particleSize: 0.5,
    count: "1000",
    samplerId: "LPC-1",
    calibrationDue: "2026-12-31",
    shift: "白班",
    sampledAt: "2026-09-23T10:00",
    ...p,
  };
}

// 1. 合格正常采样
let s = emptyState();
let r = submitSample(s, f({}), NOW);
check("合格采样通过", r.ok);
if (r.ok) {
  s = r.state;
  eq("房间在用", getRoom(s, "CR-T1").status, "active");
  check("无异常单", s.exceptions.length === 0);
}

// 2. 校准过期 → 异常单 + 停用，输入原样保留
s = emptyState();
r = submitSample(s, f({ calibrationDue: "2026-08-01", count: "1000" }), NOW);
check("校准过期仍可提交（保留输入）", r.ok);
if (r.ok) {
  s = r.state;
  eq("违规码", r.sample.violations, ["CALIBRATION_EXPIRED"]);
  eq("采样计数原值保留", r.sample.count, 1000);
  check("生成异常单", !!r.exception && s.exceptions.length === 1);
  eq("房间停用", getRoom(s, "CR-T1").status, "decommissioned");
}

// 3. 粒径与等级不匹配（ISO 5 无 0.1μm）
s = emptyState();
r = submitSample(s, f({ particleSize: 0.1, count: "10" }), NOW);
check("粒径不匹配仍可提交", r.ok);
if (r.ok) eq("违规码", r.sample.violations, ["SIZE_MISMATCH"]);

// 4. 计数超限（ISO 5 / 0.5μm 限值 3520）
s = emptyState();
r = submitSample(s, f({ count: "3521" }), NOW);
check("超限仍可提交", r.ok);
if (r.ok) eq("违规码", r.sample.violations, ["COUNT_EXCEEDED"]);
// 边界：3520 合格
s = emptyState();
r = submitSample(s, f({ count: "3520" }), NOW);
check("限值边界 3520 合格", r.ok && r.sample.passed);

// 5. 停用期间不得提交正常采样（新房间可用，停用房间的提交只能是复测）
s = emptyState();
r = submitSample(s, f({ count: "9999" }), NOW);
if (r.ok) s = r.state;
const normalAttempt = submitSample(s, f({ shift: "中班", count: "1000" }), NOW);
check("停用房间提交自动识别为复测", normalAttempt.ok && normalAttempt.sample.mode === "retest");
if (normalAttempt.ok) s = normalAttempt.state;

// 6. 复测必须换班
s = emptyState();
r = submitSample(s, f({ count: "9999", shift: "白班" }), NOW);
if (r.ok) s = r.state;
const sameShift = submitSample(s, f({ shift: "白班", count: "1000" }), NOW);
check("同班次复测被拦截", !sameShift.ok);

// 7. 复测失败打断连续计数
s = emptyState();
r = submitSample(s, f({ count: "9999", shift: "白班" }), NOW);
if (r.ok) s = r.state;
r = submitSample(s, f({ count: "1", shift: "中班", calibrationDue: "2026-01-01" }), NOW);
check("复测（校准过期）失败被接受为异常", r.ok && !r.sample.passed && r.sample.mode === "retest");
if (r.ok) {
  s = r.state;
  eq("失败复测不计连续合格", getRoom(s, "CR-T1").consecutivePasses, 0);
  check("每次失败都生成异常单", s.exceptions.length === 2);
}

// 8. 连续两次合格复测才能放行
s = emptyState();
let init = submitSample(s, f({ count: "9999", shift: "白班" }), NOW);
if (init.ok) s = init.state;
let p1 = submitSample(s, f({ count: "1000", shift: "中班" }), NOW);
if (p1.ok) s = p1.state;
eq("一次合格后连续计数=1", getRoom(s, "CR-T1").consecutivePasses, 1);
const earlyRelease = releaseRoom(s, "CR-T1", NOW);
check("仅 1 次合格不得放行", !earlyRelease.ok);
let p2 = submitSample(s, f({ count: "1200", shift: "夜班" }), NOW);
if (p2.ok) s = p2.state;
eq("两次合格后连续计数=2", getRoom(s, "CR-T1").consecutivePasses, 2);
const rel = releaseRoom(s, "CR-T1", NOW);
check("两次合格后放行成功", rel.ok);
if (rel.ok) {
  s = rel.state;
  eq("房间冻结为 released", getRoom(s, "CR-T1").status, "released");
  check("异常单全部关闭", s.exceptions.every((e) => !e.open));
  // 9. 冻结阈值与读数
  const rec = rel.data;
  check("冻结阈值条数=3 (ISO 5)", rec.thresholds.length === 3);
  eq("放行基线读数", rec.versions[0].readings.map((x) => x.count), [1000, 1200]);
  eq("基线限值快照", rec.versions[0].readings.map((x) => x.limit), [3520, 3520]);
  eq("关联两次复测单", rec.retestSampleIds.length, 2);
  // 10. 放行后不得提交采样
  const after = submitSample(s, f({ count: "1", shift: "白班" }), NOW);
  check("放行冻结后提交被拦截", !after.ok);
  // 11. 更正：无原因拒绝
  const noReason = correctRelease(
    s,
    rec.id,
    { reason: "", editor: "甲", readings: [{ size: 0.5, count: 900 }, { size: 0.5, count: 950 }] },
    NOW
  );
  check("更正无原因被拦截", !noReason.ok);
  // 12. 更正：读数条数不一致拒绝
  const wrongLength = correctRelease(
    s,
    rec.id,
    { reason: "x", editor: "甲", readings: [{ size: 0.5, count: 900 }] },
    NOW
  );
  check("更正读数条数不一致被拦截", !wrongLength.ok);
  // 12b. 更正：粒径不可改（按位次对齐）
  const changedSize = correctRelease(
    s,
    rec.id,
    { reason: "x", editor: "甲", readings: [{ size: 1, count: 10 }, { size: 0.5, count: 950 }] },
    NOW
  );
  check("更正改动粒径被拦截", !changedSize.ok);
  // 12c. 更正：超冻结限值拒绝
  const overLimit = correctRelease(
    s,
    rec.id,
    { reason: "x", editor: "甲", readings: [{ size: 0.5, count: 3521 }, { size: 0.5, count: 950 }] },
    NOW
  );
  check("更正值超冻结限值被拦截", !overLimit.ok);
  // 13. 更正：合法 → 新版本，旧值保留（两条同粒径复测读数按位次更正）
  const fixed = correctRelease(
    s,
    rec.id,
    { reason: "誊写笔误", editor: "班组长-甲", readings: [{ size: 0.5, count: 900 }, { size: 0.5, count: 950 }] },
    NOW
  );
  check("合法更正生成新版本", fixed.ok && fixed.data.versions.length === 2);
  if (fixed.ok) {
    eq("v1 旧值保留", fixed.data.versions[0].readings.map((x) => x.count), [1000, 1200]);
    eq("v2 新值", fixed.data.versions[1].readings.map((x) => x.count), [900, 950]);
    eq("v2 原因留痕", fixed.data.versions[1].reason, "誊写笔误");
    s = fixed.state;
  }
}

// 15. 新房间（目录外）自动建档，房间号转大写
s = emptyState();
r = submitSample(s, f({ roomId: "cr-new-9" }), NOW);
if (r.ok) {
  check("新房间自动建档大写", !!r.state.rooms["CR-NEW-9"]);
}

// 16. 表单不完整拦截
s = emptyState();
r = submitSample(s, f({ roomId: "" }), NOW);
check("空房间号被拦截", !r.ok);
r = submitSample(s, f({ count: "1.5" }), NOW);
check("非整数计数被拦截", !r.ok);
r = submitSample(s, f({ count: "-3" }), NOW);
check("负数计数被拦截", !r.ok);

// 17. 种子数据自洽
const seed = buildSeedState();
check("种子含 3 个运行房间", Object.keys(seed.rooms).length >= 4);
check("种子有 1 张放行单", seed.releases.length === 1);
check("种子放行单有 v1/v2", seed.releases[0].versions.length === 2);
eq("Y-0302 已放行", seed.rooms["Y-0302"].status, "released");
eq("CR-1201 停用且可放行(2 次合格)", [seed.rooms["CR-1201"].status, seed.rooms["CR-1201"].consecutivePasses], ["decommissioned", 2]);
eq("CR-2108 停用且 1 次合格", [seed.rooms["CR-2108"].status, seed.rooms["CR-2108"].consecutivePasses], ["decommissioned", 1]);
check("种子 CR-1201 含一次粒径不匹配复测", seed.samples.some((x) => x.roomId === "CR-1201" && x.violations.includes("SIZE_MISMATCH")));
check("种子 CR-2108 含校准过期异常", seed.samples.some((x) => x.roomId === "CR-2108" && x.violations.includes("CALIBRATION_EXPIRED")));

// 18. 本地存储往返一致（内存 mock localStorage）
class MemStorage {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const mem = new MemStorage();
const adapter = createStorage(mem as unknown as Storage);
adapter.save(seed);
const loaded = adapter.load();
eq("持久化往返状态一致", loaded, seed);
// 损坏数据 → null
mem.setItem("hxwl-09.particle-release.v1", "{bad json");
eq("损坏 JSON 返回 null", adapter.load(), null);
mem.setItem("hxwl-09.particle-release.v1", JSON.stringify({ schema: 99 }));
eq("未知 schema 返回 null", adapter.load(), null);

console.log(failures === 0 ? "\n全部断言通过" : `\n${failures} 条断言失败`);
process.exit(failures === 0 ? 0 : 1);
