// 领域模型：粒子采样与恢复放行台

export type IsoClass = "ISO 5" | "ISO 6" | "ISO 7" | "ISO 8";

/** 班次：复测只能换班 */
export type Shift = "早班" | "中班" | "夜班";

export type RoomStatus = "正常" | "停用" | "已放行";

export type SampleKind = "常规采样" | "复测";

export type Verdict = "合格" | "异常";

/** 三类异常判定原因 */
export type AnomalyReason = "校准过期" | "粒径与等级不匹配" | "计数超限";

/** 房间台账（资料） */
export interface RoomInfo {
  id: string;
  name: string;
  zone: string;
  isoClass: IsoClass;
}

/** 采样单登记内容 */
export interface SampleInput {
  roomId: string;
  isoClass: IsoClass;
  /** 粒径 μm */
  particleSize: number;
  /** 计数，粒/m³ */
  count: number;
  /** 采样器编号 */
  samplerId: string;
  /** 校准有效期 yyyy-mm-dd */
  calibrationDue: string;
  shift: Shift;
}

/** 已保存的采样单（含判定结果，读数不可变） */
export interface SampleRecord extends SampleInput {
  id: string;
  seq: number;
  kind: SampleKind;
  verdict: Verdict;
  reasons: AnomalyReason[];
  /** 判定时使用的阈值；粒径不匹配时为 null */
  limit: number | null;
  /** 本地时间戳 yyyy-mm-ddTHH:mm */
  createdAt: string;
}

/** 异常单 */
export interface ExceptionTicket {
  id: string;
  seq: number;
  roomId: string;
  sampleId: string;
  reasons: AnomalyReason[];
  shift: Shift;
  openedAt: string;
  closedAt: string | null;
  status: "待复测" | "复测中" | "已关闭放行";
}

/** 房间运行态（正常采样 / 停用复测 / 已放行） */
export interface RoomRuntime {
  roomId: string;
  status: RoomStatus;
  /** 当前未关闭的异常单 */
  openExceptionId: string | null;
  /** 停用期间连续合格复测次数，达到 2 方可放行 */
  streak: number;
  lastSampleId: string | null;
  lastShift: Shift | null;
}

/** 放行时冻结的读数 */
export interface FrozenReading {
  sampleId: string;
  kind: SampleKind;
  shift: Shift;
  particleSize: number;
  count: number;
  limit: number | null;
  samplerId: string;
  calibrationDue: string;
  verdict: Verdict;
  reasons: AnomalyReason[];
  createdAt: string;
}

/** 放行记录的一个版本；v1 为放行冻结，vN 为更正版本 */
export interface ReleaseVersion {
  version: number;
  /** v1 为放行说明，vN 为必填的更正原因 */
  reason: string;
  createdAt: string;
  /** 冻结的该等级阈值表（粒/m³） */
  thresholds: Partial<Record<number, number>>;
  readings: FrozenReading[];
}

/** 放行台账记录（版本链不可变，仅追加） */
export interface ReleaseRecord {
  id: string;
  seq: number;
  roomId: string;
  /** 冻结房间名称，避免资料后续调整影响历史台账 */
  roomName: string;
  isoClass: IsoClass;
  exceptionSampleId: string;
  versions: ReleaseVersion[];
}

export interface StationState {
  seq: number;
  samples: SampleRecord[];
  exceptions: ExceptionTicket[];
  rooms: Record<string, RoomRuntime>;
  releases: ReleaseRecord[];
}

/** 对放行冻结读数的更正内容 */
export interface ReadingChange {
  sampleId: string;
  count?: number;
  samplerId?: string;
  calibrationDue?: string;
}
