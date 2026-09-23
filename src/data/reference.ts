import type { IsoClass, RoomInfo, Shift } from "../domain/types";

// —— 资料层：班次、粒径、ISO 14644-1 浓度限值、房间台账 ——
// 本文件只放静态资料，不含任何判定与存储逻辑。

export const SHIFTS: readonly Shift[] = ["早班", "中班", "夜班"];

/** 可选粒径（μm） */
export const PARTICLE_SIZES = [0.1, 0.2, 0.3, 0.5, 1, 5] as const;

/**
 * ISO 14644-1:2015 各洁净等级粒子最大允许浓度（粒/m³）。
 * 缺省粒径表示该等级不考核该粒径——登记即判“粒径与等级不匹配”。
 */
export const ISO_LIMITS: Record<IsoClass, Partial<Record<number, number>>> = {
  "ISO 5": { 0.1: 100000, 0.2: 23700, 0.3: 10200, 0.5: 3520, 1: 832, 5: 29 },
  "ISO 6": { 0.3: 102000, 0.5: 35200, 1: 8320, 5: 293 },
  "ISO 7": { 0.5: 352000, 1: 83200, 5: 2930 },
  "ISO 8": { 0.5: 3520000, 1: 832000, 5: 29300 },
};

export const ISO_CLASSES = Object.keys(ISO_LIMITS) as IsoClass[];

export const ROOMS: RoomInfo[] = [
  { id: "CR-1201", name: "光刻准备间", zone: "黄光区", isoClass: "ISO 5" },
  { id: "CR-2107", name: "刻蚀工艺区", zone: "刻蚀区", isoClass: "ISO 6" },
  { id: "CR-3305", name: "薄膜沉积区", zone: "薄膜区", isoClass: "ISO 7" },
  { id: "CR-4108", name: "后段包装间", zone: "后段区", isoClass: "ISO 8" },
];

export const ROOM_MAP: Record<string, RoomInfo> = Object.fromEntries(
  ROOMS.map((room) => [room.id, room])
);
