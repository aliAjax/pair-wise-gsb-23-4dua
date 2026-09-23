import { ROOMS, ROOM_MAP, ISO_LIMITS } from "../data/reference";
import { judge, judgeAgainstFrozen } from "./judgment";
import { addDays, stampAt } from "./clock";
import type {
  ExceptionTicket,
  FrozenReading,
  ReadingChange,
  ReleaseRecord,
  RoomRuntime,
  SampleInput,
  SampleRecord,
  StationState,
} from "./types";

// —— 流程层：采样提交、停用复测、放行冻结、版本更正 ——
// 纯函数状态机；放行与更正的时间上下文由调用方注入，便于演示与测试。

export interface TimeContext {
  now: string;
  today: string;
}

export type StationAction =
  | { type: "submit"; input: SampleInput; now: string; today: string }
  | { type: "release"; roomId: string; ctx: TimeContext }
  | {
      type: "correct";
      releaseId: string;
      change: ReadingChange;
      reason: string;
      ctx: TimeContext;
    }
  | { type: "replace"; state: StationState };

function freshRoomRuntime(roomId: string): RoomRuntime {
  return {
    roomId,
    status: "正常",
    openExceptionId: null,
    streak: 0,
    lastSampleId: null,
    lastShift: null,
  };
}

export function emptyState(): StationState {
  return {
    seq: 0,
    samples: [],
    exceptions: [],
    rooms: Object.fromEntries(ROOMS.map((room) => [room.id, freshRoomRuntime(room.id)])),
    releases: [],
  };
}

export function getRoomSamples(state: StationState, roomId: string): SampleRecord[] {
  return state.samples.filter((sample) => sample.roomId === roomId);
}

// —— 提交前置守卫：返回错误文案；null 表示放行通过 ——

/** 停用期间不得提交正常采样；复测只能换班（与上一次提交不同班次） */
export function guardSubmit(state: StationState, input: SampleInput): string | null {
  const room = state.rooms[input.roomId];
  if (!room) return "房间不存在";
  if (room.status === "停用" && room.lastShift && input.shift === room.lastShift) {
    return `复测必须换班：上次提交为${room.lastShift}，请改选其他班次`;
  }
  return null;
}

/** 连续两次合格复测后才可放行 */
export function guardRelease(state: StationState, roomId: string): string | null {
  const room = state.rooms[roomId];
  if (!room) return "房间不存在";
  if (room.status !== "停用") return "房间未处于停用状态，无需放行";
  if (room.streak < 2) return `连续合格复测 ${room.streak}/2，达到 2 次后才可放行`;
  return null;
}

/** 更正必须写原因，且至少一个字段与冻结值不同 */
export function guardCorrect(
  release: ReleaseRecord,
  change: ReadingChange,
  reason: string
): string | null {
  if (!reason.trim()) return "更正必须填写原因";
  const latest = release.versions[release.versions.length - 1];
  const target = latest?.readings.find((reading) => reading.sampleId === change.sampleId);
  if (!target) return "目标读数不在最新版本中";
  if (change.count !== undefined && (!Number.isFinite(change.count) || change.count < 0)) {
    return "更正后的计数无效";
  }
  const differs =
    (change.count !== undefined && change.count !== target.count) ||
    (change.samplerId !== undefined && change.samplerId !== target.samplerId) ||
    (change.calibrationDue !== undefined && change.calibrationDue !== target.calibrationDue);
  if (!differs) return "更正内容与当前版本一致，无需生成新版本";
  return null;
}

// —— 状态机 ——

export function reducer(state: StationState, action: StationAction): StationState {
  switch (action.type) {
    case "submit":
      return submitSample(state, action.input, action.now, action.today);
    case "release":
      return releaseRoom(state, action.roomId, action.ctx);
    case "correct":
      return correctRelease(state, action.releaseId, action.change, action.reason, action.ctx);
    case "replace":
      return action.state;
    default:
      return state;
  }
}

function submitSample(
  state: StationState,
  input: SampleInput,
  now: string,
  today: string
): StationState {
  const room = state.rooms[input.roomId];
  if (!room) return state;

  const seq = state.seq + 1;
  const kind = room.status === "停用" ? "复测" : "常规采样";
  const judgment = judge(input, today);

  const sample: SampleRecord = {
    ...input,
    id: `SMP-${String(seq).padStart(4, "0")}`,
    seq,
    kind,
    verdict: judgment.verdict,
    reasons: judgment.reasons,
    limit: judgment.limit,
    createdAt: now,
  };

  const next: StationState = {
    ...state,
    seq,
    samples: [...state.samples, sample],
    exceptions: [...state.exceptions],
    rooms: { ...state.rooms, [input.roomId]: { ...room } },
    releases: state.releases,
  };
  const nextRoom = next.rooms[input.roomId];

  if (judgment.verdict === "异常") {
    // 异常：保留输入、生成异常单、房间进入停用
    const ticket: ExceptionTicket = {
      id: `EXP-${String(seq).padStart(4, "0")}`,
      seq,
      roomId: input.roomId,
      sampleId: sample.id,
      reasons: judgment.reasons,
      shift: input.shift,
      openedAt: now,
      closedAt: null,
      status: "待复测",
    };
    next.exceptions.push(ticket);
    nextRoom.status = "停用";
    nextRoom.openExceptionId = ticket.id;
    nextRoom.streak = 0;
  } else if (kind === "复测") {
    nextRoom.streak += 1;
    const open = next.exceptions.find((ticket) => ticket.id === room.openExceptionId);
    if (open && open.status === "待复测") open.status = "复测中";
  }

  nextRoom.lastSampleId = sample.id;
  nextRoom.lastShift = input.shift;
  return next;
}

function releaseRoom(state: StationState, roomId: string, ctx: TimeContext): StationState {
  const room = state.rooms[roomId];
  const info = ROOM_MAP[roomId];
  if (!room || !info || room.status !== "停用" || room.streak < 2) return state;

  const roomSamples = getRoomSamples(state, roomId);
  const exceptionSample = roomSamples.find(
    (sample) => sample.id === room.openExceptionId
  ) ?? [...roomSamples].reverse().find((sample) => sample.verdict === "异常");
  const retests = roomSamples
    .filter((sample) => sample.kind === "复测" && sample.verdict === "合格")
    .slice(-2);
  if (!exceptionSample || retests.length < 2) return state;

  const toReading = (sample: SampleRecord): FrozenReading => ({
    sampleId: sample.id,
    kind: sample.kind,
    shift: sample.shift,
    particleSize: sample.particleSize,
    count: sample.count,
    limit: sample.limit,
    samplerId: sample.samplerId,
    calibrationDue: sample.calibrationDue,
    verdict: sample.verdict,
    reasons: sample.reasons,
    createdAt: sample.createdAt,
  });

  const seq = state.seq + 1;
  const release: ReleaseRecord = {
    id: `REL-${String(seq).padStart(4, "0")}`,
    seq,
    roomId,
    roomName: info.name,
    isoClass: info.isoClass,
    exceptionSampleId: exceptionSample.id,
    versions: [
      {
        version: 1,
        reason: "连续两次换班复测合格，放行并冻结房间、阈值与读数",
        createdAt: ctx.now,
        thresholds: { ...ISO_LIMITS[info.isoClass] },
        readings: [exceptionSample, ...retests].map(toReading),
      },
    ],
  };

  return {
    ...state,
    seq,
    samples: state.samples,
    exceptions: state.exceptions.map((ticket) =>
      ticket.roomId === roomId && ticket.closedAt === null
        ? { ...ticket, status: "已关闭放行", closedAt: ctx.now }
        : ticket
    ),
    rooms: {
      ...state.rooms,
      [roomId]: { ...room, status: "已放行", openExceptionId: null, streak: 0 },
    },
    releases: [...state.releases, release],
  };
}

function correctRelease(
  state: StationState,
  releaseId: string,
  change: ReadingChange,
  reason: string,
  ctx: TimeContext
): StationState {
  const index = state.releases.findIndex((release) => release.id === releaseId);
  if (index < 0) return state;
  const release = state.releases[index];
  const latest = release.versions[release.versions.length - 1];
  if (!latest || !latest.readings.some((reading) => reading.sampleId === change.sampleId)) {
    return state;
  }

  // 以放行日期为基准，用冻结阈值重新判定更正后的读数
  const asOf = release.versions[0].createdAt.slice(0, 10);
  const readings = latest.readings.map((reading) => {
    if (reading.sampleId !== change.sampleId) return { ...reading };
    const merged: FrozenReading = {
      ...reading,
      count: change.count ?? reading.count,
      samplerId: change.samplerId ?? reading.samplerId,
      calibrationDue: change.calibrationDue ?? reading.calibrationDue,
    };
    const judgment = judgeAgainstFrozen(merged, latest.thresholds, asOf);
    return { ...merged, verdict: judgment.verdict, reasons: judgment.reasons, limit: judgment.limit };
  });

  const version = {
    version: latest.version + 1,
    reason: reason.trim(),
    createdAt: ctx.now,
    thresholds: { ...latest.thresholds },
    readings,
  };

  const updated: ReleaseRecord = { ...release, versions: [...release.versions, version] };
  const releases = [...state.releases];
  releases[index] = updated;
  return { ...state, releases };
}

// —— 演示场景：覆盖异常停用、换班复测、放行冻结与版本更正 ——

export function buildDemoState(ctx: TimeContext): StationState {
  let state = emptyState();
  const d1 = addDays(ctx.today, -3);
  const d2 = addDays(ctx.today, -2);
  const d3 = addDays(ctx.today, -1);

  const submit = (
    roomId: string,
    date: string,
    hh: number,
    mm: number,
    input: Omit<SampleInput, "roomId" | "isoClass">
  ) => {
    const info = ROOM_MAP[roomId];
    state = reducer(state, {
      type: "submit",
      input: { ...input, roomId, isoClass: info.isoClass },
      now: stampAt(date, hh, mm),
      today: date,
    });
  };

  // CR-1201（ISO 5）：校准过期 → 停用 → 换班复测两次合格 → 放行 → 更正采样器编号
  submit("CR-1201", d1, 8, 20, {
    particleSize: 0.5,
    count: 2100,
    samplerId: "PC-101",
    calibrationDue: addDays(d1, -1),
    shift: "早班",
  });
  submit("CR-1201", d2, 16, 10, {
    particleSize: 0.5,
    count: 1820,
    samplerId: "PC-101",
    calibrationDue: addDays(ctx.today, 180),
    shift: "中班",
  });
  submit("CR-1201", d3, 8, 40, {
    particleSize: 0.5,
    count: 1640,
    samplerId: "PC-101",
    calibrationDue: addDays(ctx.today, 180),
    shift: "早班",
  });
  state = reducer(state, {
    type: "release",
    roomId: "CR-1201",
    ctx: { now: stampAt(d3, 9, 5), today: d3 },
  });
  const releaseId = state.releases[state.releases.length - 1]?.id;
  if (releaseId) {
    state = reducer(state, {
      type: "correct",
      releaseId,
      change: { sampleId: "SMP-0001", samplerId: "PC-101（已重校）" },
      reason: "采样器编号登记有误，更正为重新校准后的编号",
      ctx: { now: stampAt(d3, 10, 30), today: d3 },
    });
  }

  // CR-2107（ISO 6）：0.1μm 粒径不考核 → 不匹配异常 → 停用待复测
  submit("CR-2107", ctx.today, 9, 15, {
    particleSize: 0.1,
    count: 42000,
    samplerId: "PC-102",
    calibrationDue: addDays(ctx.today, 90),
    shift: "早班",
  });

  // CR-3305（ISO 7）：正常合格
  submit("CR-3305", ctx.today, 10, 5, {
    particleSize: 0.5,
    count: 128000,
    samplerId: "PC-103",
    calibrationDue: addDays(ctx.today, 200),
    shift: "早班",
  });

  return state;
}
