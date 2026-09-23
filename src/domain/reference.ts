// 资料层：ISO 等级阈值、房间目录、标签字典（纯静态，不含判定）

import type { IsoClass, ParticleSize, Shift, ViolationCode } from "./types";

/** ISO 14644-1:2015 表 A.1 粒子浓度限值（粒/m³），"-" 表示该等级不适用此粒径 */
export const ISO_LIMITS: Record<IsoClass, Partial<Record<ParticleSize, number>>> = {
  "ISO 5": { 0.5: 3520, 1: 832, 5: 29 },
  "ISO 6": { 0.5: 35200, 1: 8320, 5: 293 },
  "ISO 7": { 0.1: 352000, 0.2: 75700, 0.3: 35700, 0.5: 3520, 1: 832, 5: 293 },
  "ISO 8": { 0.1: 3520000, 0.2: 757000, 0.3: 357000, 0.5: 35200, 1: 8320, 5: 2930 },
};

export const ISO_CLASSES: IsoClass[] = ["ISO 5", "ISO 6", "ISO 7", "ISO 8"];

/** 各等级允许的粒径（限值表中有定义的） */
export const ISO_SIZES: Record<IsoClass, ParticleSize[]> = {
  "ISO 5": [0.5, 1, 5],
  "ISO 6": [0.5, 1, 5],
  "ISO 7": [0.1, 0.2, 0.3, 0.5, 1, 5],
  "ISO 8": [0.1, 0.2, 0.3, 0.5, 1, 5],
};

export const ALL_SIZES: ParticleSize[] = [0.1, 0.2, 0.3, 0.5, 1, 5];

export const SHIFTS: Shift[] = ["白班", "中班", "夜班"];

export const SHIFT_LABEL: Record<Shift, string> = {
  白班: "白班",
  中班: "中班",
  夜班: "夜班",
};

export const VIOLATION_LABEL: Record<ViolationCode, string> = {
  CALIBRATION_EXPIRED: "校准有效期过期",
  SIZE_MISMATCH: "粒径与 ISO 等级不匹配",
  COUNT_EXCEEDED: "粒子计数超过等级限值",
};

export const VIOLATION_HINT: Record<ViolationCode, string> = {
  CALIBRATION_EXPIRED: "采样器校准已过期，需更换校准有效期内的采样器后复测",
  SIZE_MISMATCH: "所选粒径不在该 ISO 等级的适用范围内，请核对等级与粒径",
  COUNT_EXCEEDED: "粒子计数超出该等级限值，房间需停用并在其他班次复测",
};

export interface RoomDirectoryEntry {
  roomId: string;
  isoClass: IsoClass;
  zone: string;
  note: string;
}

/** 房间目录（资料）。未登记房间可在采样时自由录入房间号并自动建档。 */
export const ROOM_DIRECTORY: RoomDirectoryEntry[] = [
  { roomId: "CR-1201", isoClass: "ISO 5", zone: "黄光区", note: "光刻间" },
  { roomId: "CR-2107", isoClass: "ISO 6", zone: "洁净走廊", note: "公共通道" },
  { roomId: "CR-2108", isoClass: "ISO 7", zone: "组装区", note: "设备组装" },
  { roomId: "Y-0302", isoClass: "ISO 8", zone: "原料仓", note: "原材料存放" },
];

export function findRoomDirectory(roomId: string): RoomDirectoryEntry | undefined {
  return ROOM_DIRECTORY.find((r) => r.roomId === roomId);
}

/** 粒径显示文本（0.5um 之类） */
export function sizeLabel(size: ParticleSize): string {
  return `${size}μm`;
}

/** 等级+粒径的限值说明，用于页面实时预览 */
export function limitText(isoClass: IsoClass, size: ParticleSize): string | null {
  const limit = ISO_LIMITS[isoClass][size];
  if (limit === undefined) return null;
  return `≤ ${limit.toLocaleString("zh-CN")} 粒/m³`;
}
