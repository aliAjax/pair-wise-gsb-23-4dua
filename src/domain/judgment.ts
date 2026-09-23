import { ISO_LIMITS } from "../data/reference";
import type { AnomalyReason, IsoClass, Verdict } from "./types";

// —— 判定层：纯函数，不碰 React 与 localStorage ——

export interface Judgment {
  verdict: Verdict;
  reasons: AnomalyReason[];
  /** 命中的阈值；粒径与等级不匹配时为 null */
  limit: number | null;
}

/** 取某等级某粒径的限值；undefined 表示该等级不考核该粒径 */
export function thresholdFor(
  isoClass: IsoClass,
  particleSize: number
): number | undefined {
  return ISO_LIMITS[isoClass]?.[particleSize];
}

/** 校准在 asOf 当天仍有效（到期当日不算过期） */
export function isCalibrationValid(calibrationDue: string, asOf: string): boolean {
  return calibrationDue.trim() !== "" && calibrationDue >= asOf;
}

/**
 * 采样判定：校准过期 / 粒径与等级不匹配 / 计数超限，
 * 命中任意一条即异常；异常输入仍然保留，交由流程层生成异常单。
 */
export function judge(
  input: {
    isoClass: IsoClass;
    particleSize: number;
    count: number;
    calibrationDue: string;
  },
  asOf: string
): Judgment {
  const reasons: AnomalyReason[] = [];

  if (!isCalibrationValid(input.calibrationDue, asOf)) {
    reasons.push("校准过期");
  }

  const limit = thresholdFor(input.isoClass, input.particleSize);
  if (limit === undefined) {
    reasons.push("粒径与等级不匹配");
  } else if (input.count > limit) {
    reasons.push("计数超限");
  }

  return {
    verdict: reasons.length === 0 ? "合格" : "异常",
    reasons,
    limit: limit ?? null,
  };
}

/** 放行后更正：用放行时冻结的阈值重新判定读数 */
export function judgeAgainstFrozen(
  reading: { particleSize: number; count: number; calibrationDue: string },
  frozenThresholds: Partial<Record<number, number>>,
  asOf: string
): Judgment {
  const reasons: AnomalyReason[] = [];
  if (!isCalibrationValid(reading.calibrationDue, asOf)) {
    reasons.push("校准过期");
  }
  const limit = frozenThresholds[reading.particleSize];
  if (limit === undefined) {
    reasons.push("粒径与等级不匹配");
  } else if (reading.count > limit) {
    reasons.push("计数超限");
  }
  return {
    verdict: reasons.length === 0 ? "合格" : "异常",
    reasons,
    limit: limit ?? null,
  };
}
