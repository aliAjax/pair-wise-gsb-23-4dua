import { ROOM_MAP } from "../../data/reference";
import type { SampleRecord } from "../../domain/types";
import { formatCount, formatLimit, formatStamp } from "../format";

interface SampleTableProps {
  samples: SampleRecord[];
}

export function SampleTable({ samples }: SampleTableProps) {
  const ordered = [...samples].sort((a, b) => b.seq - a.seq);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>单号</th>
            <th>时间</th>
            <th>房间</th>
            <th>类型</th>
            <th>等级/粒径</th>
            <th className="num">计数</th>
            <th className="num">限值</th>
            <th>采样器/校准</th>
            <th>班次</th>
            <th>判定</th>
          </tr>
        </thead>
        <tbody>
          {ordered.length === 0 && (
            <tr>
              <td colSpan={10} className="empty-cell">
                暂无采样单
              </td>
            </tr>
          )}
          {ordered.map((sample) => (
            <tr key={sample.id} className={sample.verdict === "异常" ? "row-abnormal" : ""}>
              <td className="mono">{sample.id}</td>
              <td className="nowrap">{formatStamp(sample.createdAt)}</td>
              <td>
                {sample.roomId}
                <small>{ROOM_MAP[sample.roomId]?.name ?? ""}</small>
              </td>
              <td>{sample.kind}</td>
              <td>
                {sample.isoClass} · {sample.particleSize}μm
              </td>
              <td className="num">{formatCount(sample.count)}</td>
              <td className="num">{formatLimit(sample.limit)}</td>
              <td>
                {sample.samplerId}
                <small>校准至 {sample.calibrationDue}</small>
              </td>
              <td>{sample.shift}</td>
              <td>
                {sample.verdict === "合格" ? (
                  <span className="badge tone-ok">合格</span>
                ) : (
                  <span className="badge tone-danger" title={sample.reasons.join("、")}>
                    异常：{sample.reasons.join("/")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
