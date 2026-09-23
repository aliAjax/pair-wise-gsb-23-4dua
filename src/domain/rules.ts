// 判定层：纯函数，无副作用、无存储依赖

import { ISO_LIMITS, ISO_SIZES } from "./reference";
import type {
  IsoClass,
  ParticleSize,
  SamplingFormValues,
  Shift,
  ViolationCode,
} from "./types";

/** 校准是否仍在有效期内（due date 为 yyyy-MM-dd，按天比较，含当日） */
export function isCalibrationValid(calibrationDue: string, now: Date): boolean {
  if (!calibrationDue) return false;
  const due = new Date(`${calibrationDue}T23:59:59`);
  if (Number.isNaN(due.getTime())) return false;
  return now.getTime() <= due.getTime();
}

/** 该粒径是否适用于该 ISO 等级 */
export function isSizeApplicable(isoClass: IsoClass, size: ParticleSize): boolean {
  return ISO_SIZES[isoClass].includes(size);
}

/** 该等级该粒径的计数限值，undefined 表示不适用 */
export function countLimit(isoClass: IsoClass, size: ParticleSize): number | undefined {
  return ISO_LIMITS[isoClass][size];
}

/** 计数是否超限 */
export function isCountExceeded(isoClass: IsoClass, size: ParticleSize, count: number): boolean {
  const limit = countLimit(isoClass, size);
  if (limit === undefined) return false; // 不适用的组合由 SIZE_MISMATCH 判定
  return count > limit;
}

/** 对一次采样输入做完整违规判定，返回违规码列表（空列表 = 合格） */
export function evaluateViolations(
  input: Pick<SamplingFormValues, "isoClass" | "particleSize" | "count" | "calibrationDue">,
  now: Date
): ViolationCode[] {
  const violations: ViolationCode[] = [];
  if (!input.calibrationDue || !isCalibrationValid(input.calibrationDue, now)) {
    violations.push("CALIBRATION_EXPIRED");
  }
  if (input.particleSize !== null && input.isoClass) {
    if (!isSizeApplicable(input.isoClass, input.particleSize)) {
      violations.push("SIZE_MISMATCH");
    } else if (input.count !== "" && Number.isFinite(Number(input.count))) {
      if (isCountExceeded(input.isoClass, input.particleSize, Number(input.count))) {
        violations.push("COUNT_EXCEEDED");
      }
    }
  }
  return violations;
}

export interface FormValidation {
  errors: string[];
  /** 解析后的计数，仅当计数为合法非负整数时给出 */
  count: number | null;
}

/** 表单完整性校验（不含业务判定） */
export function validateSamplingForm(values: SamplingFormValues): FormValidation {
  const errors: string[] = [];
  const roomId = values.roomId.trim();
  const samplerId = values.samplerId.trim();
  if (!roomId) errors.push("房间号不能为空");
  if (!values.isoClass) errors.push("请选择 ISO 等级");
  if (values.particleSize === null) errors.push("请选择粒子粒径");
  if (!samplerId) errors.push("采样器编号不能为空");
  if (!values.calibrationDue) errors.push("请选择校准有效期");
  if (!values.shift) errors.push("请选择班次");
  if (!values.sampledAt) errors.push("请选择采样时间");

  let count: number | null = null;
  const raw = values.count.trim();
  if (!raw) {
    errors.push("粒子计数不能为空");
  } else if (!/^\d+$/.test(raw)) {
    errors.push("粒子计数必须是非负整数");
  } else {
    count = Number(raw);
  }

  if (values.isoClass && values.particleSize !== null) {
    if (!isSizeApplicable(values.isoClass, values.particleSize)) {
      // 粒径与等级不匹配属于业务异常，不阻塞提交，只在 live hint 中提示
    } else if (count !== null && isCountExceeded(values.isoClass, values.particleSize, count)) {
      // 同上，超限不阻塞提交
    }
  }

  return { errors, count };
}

/** 复测是否允许：房间已停用，且复测班次与上一次采样班次不同 */
export function isRetestAllowed(
  roomStatus: "active" | "decommissioned" | "released",
  lastShift: Shift | undefined,
  retestShift: Shift
): { allowed: boolean; reason?: string } {
  if (roomStatus !== "decommissioned") {
    return { allowed: false, reason: "房间未处于停用状态，不能提交复测" };
  }
  if (lastShift && lastShift === retestShift) {
    return { allowed: false, reason: "复测只能换班提交，请选择与上次采样不同的班次" };
  }
  return { allowed: true };
}

/** 房间是否可以放行：已停用且连续合格复测 >= 2 次 */
export function isReleaseAllowed(
  roomStatus: "active" | "decommissioned" | "released",
  consecutivePasses: number
): { allowed: boolean; reason?: string } {
  if (roomStatus === "released") return { allowed: false, reason: "该房间已放行" };
  if (roomStatus !== "decommissioned") return { allowed: false, reason: "房间未停用，不能放行" };
  if (consecutivePasses < 2) {
    return { allowed: false, reason: `连续合格复测需达到 2 次，当前为 ${consecutivePasses} 次` };
  }
  return { allowed: true };
}
