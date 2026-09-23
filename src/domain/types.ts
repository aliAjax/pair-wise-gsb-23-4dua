// 领域类型：采样单、异常单、房间运行态、放行单（版本化）

export type IsoClass = "ISO 5" | "ISO 6" | "ISO 7" | "ISO 8";
export type ParticleSize = 0.1 | 0.2 | 0.3 | 0.5 | 1 | 5;
export type Shift = "白班" | "中班" | "夜班";
export type SampleMode = "normal" | "retest";
export type RoomStatus = "active" | "decommissioned" | "released";

export type ViolationCode =
  | "CALIBRATION_EXPIRED"
  | "SIZE_MISMATCH"
  | "COUNT_EXCEEDED";

/** 页面录入的原始值（异常时也要原样保留，因此计数先以字符串收集） */
export interface SamplingFormValues {
  roomId: string;
  isoClass: IsoClass | "";
  particleSize: ParticleSize | null;
  count: string;
  samplerId: string;
  calibrationDue: string; // yyyy-MM-dd
  shift: Shift | "";
  sampledAt: string; // datetime-local 或 ISO
}

export interface SampleRecord {
  id: string;
  roomId: string;
  isoClass: IsoClass;
  particleSize: ParticleSize;
  count: number;
  samplerId: string;
  calibrationDue: string;
  shift: Shift;
  sampledAt: string; // ISO
  mode: SampleMode;
  passed: boolean;
  violations: ViolationCode[];
  exceptionId?: string;
  createdAt: string;
}

export interface ExceptionTicket {
  id: string;
  roomId: string;
  isoClass: IsoClass;
  particleSize: ParticleSize;
  count: number;
  samplerId: string;
  calibrationDue: string;
  shift: Shift;
  sampledAt: string;
  violations: ViolationCode[];
  triggerSampleId: string;
  open: boolean;
  closedByReleaseId?: string;
  createdAt: string;
}

export interface RoomRuntime {
  roomId: string;
  status: RoomStatus;
  lastShift?: Shift;
  /** 停用后连续合格复测次数，达到 2 才允许放行 */
  consecutivePasses: number;
  openExceptionId?: string;
  decommissionedAt?: string;
  releasedAt?: string;
}

export interface ThresholdEntry {
  size: ParticleSize;
  limit: number; // 粒/m³
}

export interface ReleaseReading {
  size: ParticleSize;
  count: number;
  limit: number; // 放行时冻结的限值快照
}

export interface ReleaseVersion {
  version: number;
  createdAt: string;
  reason: string;
  editor: string;
  readings: ReleaseReading[];
}

export interface ReleaseRecord {
  id: string;
  roomId: string;
  isoClass: IsoClass;
  /** 放行时冻结的房间等级阈值 */
  thresholds: ThresholdEntry[];
  /** 放行时冻结的两次复测读数（v1 基线） */
  versions: ReleaseVersion[];
  retestSampleIds: string[];
  samplerIds: string[];
  exceptionId: string;
  createdAt: string;
}

export interface Counters {
  sample: number;
  exception: number;
  release: number;
}

export interface PersistedState {
  schema: 1;
  counters: Counters;
  samples: SampleRecord[];
  exceptions: ExceptionTicket[];
  rooms: Record<string, RoomRuntime>;
  releases: ReleaseRecord[];
}

export interface SubmitOk {
  ok: true;
  state: PersistedState;
  sample: SampleRecord;
  exception?: ExceptionTicket;
}

export interface SubmitErr {
  ok: false;
  errors: string[];
}

export type SubmitResult = SubmitOk | SubmitErr;

export interface ActionOk<T> {
  ok: true;
  state: PersistedState;
  data: T;
}

export interface ActionErr {
  ok: false;
  errors: string[];
}

export type ActionResult<T> = ActionOk<T> | ActionErr;

export interface CorrectionInput {
  reason: string;
  editor: string;
  readings: { size: ParticleSize; count: number }[];
}
