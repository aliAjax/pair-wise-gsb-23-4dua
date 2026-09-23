import { buildDemoState, emptyState, guardRelease, guardSubmit, reducer, getRoomSamples } from "../src/domain/workflow";
import type { SampleInput, StationState } from "../src/domain/types";
import { stampAt } from "../src/domain/clock";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name} ${detail}`);
  } else {
    console.log(`ok  : ${name}`);
  }
}

const ctx = { now: stampAt("2026-09-23", 12, 0), today: "2026-09-23" };
let state: StationState = emptyState();

const base = (over: Partial<SampleInput> = {}): SampleInput => ({
  roomId: "CR-3305", // ISO 7
  isoClass: "ISO 7",
  particleSize: 0.5,
  count: 1000,
  samplerId: "PC-103",
  calibrationDue: "2027-01-01",
  shift: "早班",
  ...over,
});

function submit(input: SampleInput, today = "2026-09-23", hh = 9) {
  state = reducer(state, { type: "submit", input, now: stampAt(today, hh, 0), today });
  return state.samples[state.samples.length - 1];
}

// 1. 正常合格
let s = submit(base());
check("合格判定", s.verdict === "合格" && s.kind === "常规采样");
check("正常房间保持正常", state.rooms["CR-3305"].status === "正常");

// 2. 校准过期 → 异常 + 停用 + 异常单
s = submit(base({ calibrationDue: "2026-09-22" }), "2026-09-23", 10);
check("校准过期判异常", s.verdict === "异常" && s.reasons[0] === "校准过期");
check("房间停用", state.rooms["CR-3305"].status === "停用");
check("生成异常单", state.exceptions.some((t) => t.sampleId === s.id && t.closedAt === null));

// 3. 停用期间同班复测被守卫阻止
const blocked = guardSubmit(state, base({ calibrationDue: "2027-01-01", shift: "早班" }));
check("同班复测被阻止", typeof blocked === "string" && blocked.includes("换班"));

// 停用期间也不能通过 UI 走“正常采样”——kind 由状态决定
// 4. 换班第一次复测合格 streak=1，不能放行
s = submit(base({ calibrationDue: "2027-01-01", shift: "中班" }), "2026-09-23", 16);
check("第一次换班复测合格", s.kind === "复测" && s.verdict === "合格");
check("streak=1", state.rooms["CR-3305"].streak === 1);
check("streak=1 放行被阻止", guardRelease(state, "CR-3305") !== null);

// 5. 复测失败 → streak 归零，仍停用，生成第二张异常单
s = submit(base({ calibrationDue: "2027-01-01", shift: "夜班", count: 9999999 }), "2026-09-23", 22);
check("计数超限判异常", s.reasons.includes("计数超限"));
check("失败后 streak 归零且仍停用", state.rooms["CR-3305"].streak === 0 && state.rooms["CR-3305"].status === "停用");

// 6. 粒径与等级不匹配（ISO 7 不考核 0.1μm）
s = submit(base({ shift: "早班", particleSize: 0.1, count: 1 }), "2026-09-24", 8);
check("粒径不匹配判异常", s.reasons.includes("粒径与等级不匹配") && s.limit === null);
check("仍停用", state.rooms["CR-3305"].status === "停用");

// 7. 连续两次合格复测（换班）
s = submit(base({ particleSize: 0.5, shift: "中班" }), "2026-09-24", 16);
check("第一次 streak=1", state.rooms["CR-3305"].streak === 1);
s = submit(base({ shift: "夜班" }), "2026-09-24", 22);
check("第二次 streak=2", state.rooms["CR-3305"].streak === 2);
check("streak=2 放行可通过", guardRelease(state, "CR-3305") === null);

// 8. 放行冻结
const before = state.samples.length;
state = reducer(state, { type: "release", roomId: "CR-3305", ctx: { now: stampAt("2026-09-25", 9, 0), today: "2026-09-25" } });
const release = state.releases[state.releases.length - 1];
check("房间已放行", state.rooms["CR-3305"].status === "已放行");
check("异常单全部关闭", state.exceptions.filter((t) => t.roomId === "CR-3305").every((t) => t.closedAt !== null));
check("v1 冻结 3 条读数（异常+两次复测）", release.versions[0].readings.length === 3);
check("冻结 ISO 7 阈值", release.versions[0].thresholds[0.5] === 352000);
check("冻结房间名", release.roomName === "薄膜沉积区");
check("放行不新增采样", state.samples.length === before);

// 9. 更正必须写原因
let err = guardSubmit(state, base()); // 已放行房间可以常规采样
check("已放行房间可常规采样", err === null);

// 10. 更正：改计数（超冻结限值）→ 新版本 v2，旧版本保留，重判异常
const targetId = release.versions[0].readings[1].sampleId;
state = reducer(state, {
  type: "correct",
  releaseId: release.id,
  change: { sampleId: targetId, count: 400000 },
  reason: "读数抄录错误",
  ctx: { now: stampAt("2026-09-25", 10, 0), today: "2026-09-25" },
});
const rel2 = state.releases.find((r) => r.id === release.id)!;
check("生成 v2", rel2.versions.length === 2);
check("v1 旧值保留", rel2.versions[0].readings.find((r) => r.sampleId === targetId)!.count === 1000);
const changed = rel2.versions[1].readings.find((r) => r.sampleId === targetId)!;
check("v2 新值并重判超限", changed.count === 400000 && changed.verdict === "异常" && changed.reasons.includes("计数超限"));
check("v2 原因记录", rel2.versions[1].reason === "读数抄录错误");
check("更正不影响房间状态", state.rooms["CR-3305"].status === "已放行");

// 11. 演示场景可构建且包含放行记录
const demo = buildDemoState(ctx);
check("演示数据含停用房间 CR-2107", demo.rooms["CR-2107"].status === "停用");
check("演示数据含放行 CR-1201", demo.rooms["CR-1201"].status === "已放行");
const demoRel = demo.releases[0];
check("演示放行已有 v2 更正", demoRel.versions.length === 2);
check("演示 CR-3305 合格常规", getRoomSamples(demo, "CR-3305")[0].verdict === "合格");

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURES`);
if (failures > 0) process.exit(1);
