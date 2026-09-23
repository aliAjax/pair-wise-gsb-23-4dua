// 状态流转层：采样提交、停用、复测、放行、版本更正（纯函数，不触碰存储）

import { ISO_LIMITS } from "./reference";
import {
  evaluateViolations,
  isRetestAllowed,
  isReleaseAllowed,
  validateSamplingForm,
} from "./rules";
import type {
  ActionResult,
  Counters,
  CorrectionInput,
  ExceptionTicket,
  PersistedState,
  ReleaseRecord,
  RoomRuntime,
  SampleRecord,
  SamplingFormValues,
  SubmitResult,
  ThresholdEntry,
} from "./types";

export const SCHEMA_VERSION = 1 as const;

export function emptyState(): PersistedState {
  return {
    schema: SCHEMA_VERSION,
    counters: { sample: 0, exception: 0, release: 0 },
    samples: [],
    exceptions: [],
    rooms: {},
    releases: [],
  };
}

function nextId(prefix: string, counters: Counters, kind: keyof Counters): string {
  const value = counters[kind] + 1;
  return `${prefix}-${String(value).padStart(4, "0")}`;
}

function snapshotThresholds(isoClass: SampleRecord["isoClass"]): ThresholdEntry[] {
  return Object.entries(ISO_LIMITS[isoClass]).map(([size, limit]) => ({
    size: Number(size) as ThresholdEntry["size"],
    limit: limit as number,
  }));
}

export function getRoom(state: PersistedState, roomId: string): RoomRuntime {
  return (
    state.rooms[roomId] || {
      roomId,
      status: "active",
      consecutivePasses: 0,
    }
  );
}

export function latestRelease(state: PersistedState, roomId: string): ReleaseRecord | undefined {
  const list = state.releases.filter((r) => r.roomId === roomId);
  return list[list.length - 1];
}

/**
 * 提交采样单。
 * - 合格：写采样记录；若房间处于停用状态则累计连续合格复测。
 * - 不合格（校准过期 / 粒径不匹配 / 计数超限）：原样保留输入并生成异常单，房间进入停用。
 * - 停用期间不得提交正常采样；复测必须换班。
 */
export function submitSample(
  prev: PersistedState,
  raw: SamplingFormValues,
  now: Date
): SubmitResult {
  const validation = validateSamplingForm(raw);
  if (validation.errors.length > 0 || validation.count === null) {
    return { ok: false, errors: validation.errors };
  }

  const roomId = raw.roomId.trim().toUpperCase();
  const samplerId = raw.samplerId.trim();
  const isoClass = raw.isoClass as SampleRecord["isoClass"];
  const particleSize = raw.particleSize as number as SampleRecord["particleSize"];
  const shift = raw.shift as SampleRecord["shift"];
  const count = validation.count;
  const sampledAt = toIso(raw.sampledAt, now);

  const state: PersistedState = structuredClone(prev);
  const room = getRoom(state, roomId);

  if (room.status === "released") {
    return { ok: false, errors: ["房间已放行冻结；如需更正放行数据，请在放行单中发起版本更正"] };
  }

  const mode: SampleRecord["mode"] = room.status === "decommissioned" ? "retest" : "normal";

  if (mode === "retest") {
    const retest = isRetestAllowed(room.status, room.lastShift, shift);
    if (!retest.allowed) {
      return { ok: false, errors: [retest.reason || "复测不被允许"] };
    }
  }

  const violations = evaluateViolations(
    { isoClass, particleSize, count: String(count), calibrationDue: raw.calibrationDue },
    now
  );
  const passed = violations.length === 0;
  const nowIso = now.toISOString();

  const sample: SampleRecord = {
    id: nextId("SP", state.counters, "sample"),
    roomId,
    isoClass,
    particleSize,
    count,
    samplerId,
    calibrationDue: raw.calibrationDue,
    shift,
    sampledAt,
    mode,
    passed,
    violations,
    createdAt: nowIso,
  };
  state.counters.sample += 1;

  let exception: ExceptionTicket | undefined;

  if (passed) {
    if (room.status === "decommissioned") {
      room.status = "decommissioned";
      room.consecutivePasses += 1;
    }
  } else {
    // 只保留输入：异常输入写入采样记录，并生成异常单，房间进入停用
    exception = {
      id: nextId("EX", state.counters, "exception"),
      roomId,
      isoClass,
      particleSize,
      count,
      samplerId,
      calibrationDue: raw.calibrationDue,
      shift,
      sampledAt,
      violations,
      triggerSampleId: sample.id,
      open: true,
      createdAt: nowIso,
    };
    state.counters.exception += 1;
    sample.exceptionId = exception.id;

    room.status = "decommissioned";
    // 新的一次失败（含复测失败）打断连续合格计数
    room.consecutivePasses = 0;
    room.openExceptionId = exception.id;
    if (!room.decommissionedAt) room.decommissionedAt = nowIso;
  }

  room.lastShift = shift;
  state.rooms[roomId] = room;
  state.samples.push(sample);
  if (exception) state.exceptions.push(exception);

  return { ok: true, state, sample, exception };
}

/**
 * 放行：连续两次合格复测后允许。
 * 冻结房间、阈值快照与两次复测读数；关闭该房间所有未关闭异常单。
 */
export function releaseRoom(
  prev: PersistedState,
  roomId: string,
  now: Date
): ActionResult<ReleaseRecord> {
  const state: PersistedState = structuredClone(prev);
  const key = roomId.trim().toUpperCase();
  const room = state.rooms[key];
  if (!room || room.status !== "decommissioned") {
    return { ok: false, errors: [isReleaseAllowed(room?.status ?? "active", 0).reason || "不能放行"] };
  }

  const allowed = isReleaseAllowed(room.status, room.consecutivePasses);
  if (!allowed.allowed) {
    return { ok: false, errors: [allowed.reason || "不能放行"] };
  }

  // 最近一次异常之后的两次合格复测
  const retests = state.samples
    .filter((s) => s.roomId === key && s.mode === "retest" && s.passed)
    .slice(-2);
  if (retests.length < 2) {
    return { ok: false, errors: ["缺少两次合格复测读数，无法冻结放行基线"] };
  }

  const isoClass = retests[0].isoClass;
  const nowIso = now.toISOString();
  const record: ReleaseRecord = {
    id: nextId("RL", state.counters, "release"),
    roomId: key,
    isoClass,
    thresholds: snapshotThresholds(isoClass),
    versions: [
      {
        version: 1,
        createdAt: nowIso,
        reason: "连续两次合格复测后放行（基线冻结）",
        editor: "系统放行",
        readings: retests.map((s) => {
          const limit = ISO_LIMITS[s.isoClass][s.particleSize];
          return { size: s.particleSize, count: s.count, limit: limit as number };
        }),
      },
    ],
    retestSampleIds: retests.map((s) => s.id),
    samplerIds: retests.map((s) => s.samplerId),
    exceptionId: room.openExceptionId || "",
    createdAt: nowIso,
  };
  state.counters.release += 1;

  // 冻结房间
  room.status = "released";
  room.releasedAt = nowIso;
  room.consecutivePasses = 0;
  delete room.openExceptionId;
  state.rooms[key] = room;

  state.exceptions = state.exceptions.map((e) =>
    e.roomId === key && e.open ? { ...e, open: false, closedByReleaseId: record.id } : e
  );

  state.releases.push(record);
  return { ok: true, state, data: record };
}

/**
 * 放行后更正：必须填写原因，生成新版本，旧版本完整保留。
 * 只能更正读数；读数仍须满足放行时冻结的阈值。
 */
export function correctRelease(
  prev: PersistedState,
  releaseId: string,
  correction: CorrectionInput,
  now: Date
): ActionResult<ReleaseRecord> {
  const reason = correction.reason.trim();
  const editor = correction.editor.trim();
  const errors: string[] = [];
  if (!reason) errors.push("更正是必须填写原因");
  if (!editor) errors.push("请填写更正人");
  if (correction.readings.length === 0) errors.push("至少需要一条读数");
  if (correction.readings.some((r) => !Number.isInteger(r.count) || r.count < 0)) {
    errors.push("读数必须是非负整数");
  }
  if (errors.length > 0) return { ok: false, errors };

  const state: PersistedState = structuredClone(prev);
  const index = state.releases.findIndex((r) => r.id === releaseId);
  if (index === -1) return { ok: false, errors: ["未找到放行单"] };

  const record = state.releases[index];
  const latestVersion = record.versions[record.versions.length - 1];
  if (correction.readings.length !== latestVersion.readings.length) {
    return {
      ok: false,
      errors: [
        `更正读数条数必须与冻结基线一致（${latestVersion.readings.length} 条，两次复测各一条）`,
      ],
    };
  }
  // 按位次对齐（两次复测可能测同一粒径，因此不能按粒径去重）：粒径不可变，只能更正计数
  for (let i = 0; i < latestVersion.readings.length; i += 1) {
    if (correction.readings[i].size !== latestVersion.readings[i].size) {
      return {
        ok: false,
        errors: [`第 ${i + 1} 条读数的粒径 ${latestVersion.readings[i].size}μm 不可更改`],
      };
    }
  }

  // 更正后读数仍须满足冻结阈值
  for (const reading of correction.readings) {
    const limit = record.thresholds.find((t) => t.size === reading.size)?.limit;
    if (limit === undefined || reading.count > limit) {
      errors.push(`粒径 ${reading.size}μm 的读数 ${reading.count} 超过冻结限值 ${limit ?? "—"}`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };

  record.versions.push({
    version: latestVersion.version + 1,
    createdAt: now.toISOString(),
    reason,
    editor,
    readings: correction.readings.map((r) => {
      const limit = record.thresholds.find((t) => t.size === r.size)?.limit as number;
      return { size: r.size, count: r.count, limit };
    }),
  });
  state.releases[index] = record;

  return { ok: true, state, data: record };
}

/** datetime-local / ISO 统一为 ISO 字符串；非法时回退到当前时间 */
export function toIso(value: string, now: Date): string {
  if (!value) return now.toISOString();
  const parsed = new Date(value.length === 16 ? value.replace(" ", "T") : value);
  return Number.isNaN(parsed.getTime()) ? now.toISOString() : parsed.toISOString();
}
