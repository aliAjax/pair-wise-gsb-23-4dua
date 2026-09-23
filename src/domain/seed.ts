// 演示种子数据：全部通过判定/流转接口生成，保证与真实操作同路径

import {
  correctRelease,
  emptyState,
  releaseRoom,
  submitSample,
} from "./store";
import type {
  IsoClass,
  ParticleSize,
  PersistedState,
  SamplingFormValues,
  Shift,
} from "./types";

/** 可控时钟：种子时间固定，避免演示数据每次刷新漂移 */
class SeedClock {
  private current: Date;
  constructor(initial: string) {
    this.current = new Date(initial);
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(days: number, hours: number): void {
    this.current = new Date(this.current.getTime() + (days * 24 + hours) * 3600_000);
  }
}

function form(
  roomId: string,
  isoClass: IsoClass,
  particleSize: ParticleSize,
  count: number,
  samplerId: string,
  calibrationDue: string,
  shift: Shift,
  sampledAt: string
): SamplingFormValues {
  return {
    roomId,
    isoClass,
    particleSize,
    count: String(count),
    samplerId,
    calibrationDue,
    shift,
    sampledAt,
  };
}

// 种子基准日为 2026-09-23，与当前日期一致，校准状态/时间线可即时对照
export function buildSeedState(): PersistedState {
  const clock = new SeedClock("2026-09-23T09:00:00");
  let state = emptyState();
  const submit = (values: SamplingFormValues) => {
    const result = submitSample(state, values, clock.now());
    if (!result.ok) {
      throw new Error(`种子数据构造失败: ${result.errors.join("；")}`);
    }
    state = result.state;
  };

  // 1) CR-2107 白班正常采样合格（ISO 6 / 0.5μm，限值 35,200）
  submit(
    form("CR-2107", "ISO 6", 0.5, 18400, "LPC-102", "2026-12-31", "白班", "2026-09-23T09:00")
  );

  // 2) CR-1201 白班计数超限 → 异常单 + 停用（ISO 5 / 0.5μm，限值 3,520）
  clock.advance(0, 2);
  submit(
    form("CR-1201", "ISO 5", 0.5, 5180, "LPC-101", "2026-11-15", "白班", "2026-09-23T11:00")
  );

  // 3) CR-1201 中班复测选错粒径（ISO 5 不适用 0.1μm）→ 粒径不匹配，复测失败、计数清零
  clock.advance(0, 5);
  submit(
    form("CR-1201", "ISO 5", 0.1, 820, "LPC-101", "2026-11-15", "中班", "2026-09-23T16:00")
  );

  // 4) CR-1201 夜班复测合格（再次换班，连续合格 1 次，仍停用）
  clock.advance(0, 5);
  submit(
    form("CR-1201", "ISO 5", 0.5, 1960, "LPC-101", "2026-11-15", "夜班", "2026-09-23T21:00")
  );

  // 5) CR-1201 次日白班第二次复测合格（连续合格 2 次 → 等待放行）
  clock.advance(1, 2);
  submit(
    form("CR-1201", "ISO 5", 0.5, 2120, "LPC-101", "2026-11-15", "白班", "2026-09-24T08:00")
  );

  // 6) CR-2108 中班采样器校准过期 → 异常单 + 停用（ISO 7 / 0.5μm）
  clock.advance(0, 2);
  submit(
    form("CR-2108", "ISO 7", 0.5, 2200, "LPC-205", "2026-08-31", "中班", "2026-09-24T10:00")
  );

  // 7) CR-2108 夜班更换校准有效采样器复测合格（连续合格 1 次，尚不能放行）
  clock.advance(0, 6);
  submit(
    form("CR-2108", "ISO 7", 0.5, 2410, "LPC-206", "2027-03-01", "夜班", "2026-09-24T16:00")
  );

  // 8) Y-0302 中班计数超限 → 异常停用（ISO 8 / 0.3μm，限值 357,000）
  clock.advance(0, 16);
  submit(
    form("Y-0302", "ISO 8", 0.3, 420000, "LPC-301", "2026-10-31", "白班", "2026-09-25T08:00")
  );
  // 9) Y-0302 夜班第一次复测合格
  clock.advance(0, 8);
  submit(
    form("Y-0302", "ISO 8", 0.3, 210000, "LPC-301", "2026-10-31", "夜班", "2026-09-25T16:00")
  );
  // 10) Y-0302 次日白班第二次复测合格
  clock.advance(1, 1);
  submit(
    form("Y-0302", "ISO 8", 0.3, 198000, "LPC-301", "2026-10-31", "白班", "2026-09-26T09:00")
  );
  // 11) 连续两次合格 → 放行（冻结房间、阈值、读数）
  clock.advance(0, 2);
  const released = releaseRoom(state, "Y-0302", clock.now());
  if (!released.ok) throw new Error(`种子放行失败: ${released.errors.join("；")}`);
  state = released.state;

  // 12) 放行后更正读数（誊写笔误）：写原因 → 生成 v2，v1 完整保留
  clock.advance(0, 3);
  const corrected = correctRelease(
    state,
    released.data.id,
    {
      reason: "复测原始单誊写笔误：夜班 0.3μm 计数 210,000 更正为 205,000；白班 198,000 更正为 190,000，原始单已拍照存档",
      editor: "班组长-周敏",
      readings: [
        { size: 0.3, count: 205000 },
        { size: 0.3, count: 190000 },
      ],
    },
    clock.now()
  );
  if (!corrected.ok) throw new Error(`种子更正失败: ${corrected.errors.join("；")}`);
  state = corrected.state;

  return state;
}
