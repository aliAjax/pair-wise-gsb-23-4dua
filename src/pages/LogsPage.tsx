import { useMemo, useState } from "react";
import { useAppState } from "../app/useAppState";
import { fmtDate, fmtDateTime } from "../app/format";
import { VIOLATION_LABEL, sizeLabel } from "../domain/reference";
import type { SampleRecord } from "../domain/types";
import { Badge, EmptyState } from "./components";

type ResultFilter = "all" | "pass" | "fail";
type ModeFilter = "all" | "normal" | "retest";

export function LogsPage() {
  const { state } = useAppState();
  const [room, setRoom] = useState("");
  const [result, setResult] = useState<ResultFilter>("all");
  const [mode, setMode] = useState<ModeFilter>("all");

  const roomKeys = useMemo(
    () => [...new Set(state.samples.map((s) => s.roomId))].sort(),
    [state.samples]
  );

  const rows = useMemo(() => {
    return [...state.samples]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .filter((s) => (room ? s.roomId === room : true))
      .filter((s) =>
        result === "all" ? true : result === "pass" ? s.passed : !s.passed
      )
      .filter((s) => (mode === "all" ? true : s.mode === mode));
  }, [state.samples, room, result, mode]);

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>采样记录</p>
          <h2>全部采样单</h2>
        </div>
        <div className="filter-bar">
          <select value={room} onChange={(e) => setRoom(e.target.value)} aria-label="按房间筛选">
            <option value="">全部房间</option>
            {roomKeys.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as ModeFilter)} aria-label="按类型筛选">
            <option value="all">正常+复测</option>
            <option value="normal">仅正常采样</option>
            <option value="retest">仅复测</option>
          </select>
          <select value={result} onChange={(e) => setResult(e.target.value as ResultFilter)} aria-label="按结果筛选">
            <option value="all">全部结果</option>
            <option value="pass">合格</option>
            <option value="fail">异常</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState>没有符合条件的采样记录</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>采样单</th>
                <th>房间</th>
                <th>等级</th>
                <th>粒径</th>
                <th>计数（粒/m³）</th>
                <th>采样器 / 校准</th>
                <th>班次</th>
                <th>类型</th>
                <th>判定</th>
                <th>采样时间</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <LogRow key={s.id} sample={s} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LogRow({ sample }: { sample: SampleRecord }) {
  return (
    <tr className={sample.passed ? "" : "row-danger"}>
      <td className="mono">{sample.id}</td>
      <td>{sample.roomId}</td>
      <td>{sample.isoClass}</td>
      <td>{sizeLabel(sample.particleSize)}</td>
      <td className={sample.passed ? "" : "danger-text"}>
        {sample.count.toLocaleString("zh-CN")}
      </td>
      <td>
        {sample.samplerId}
        <br />
        <small>校准至 {fmtDate(sample.calibrationDue)}</small>
      </td>
      <td>{sample.shift}</td>
      <td>{sample.mode === "retest" ? <Badge tone="warn">复测</Badge> : <Badge>正常</Badge>}</td>
      <td>
        {sample.passed ? (
          <Badge tone="ok">合格</Badge>
        ) : (
          <div className="cell-violations">
            <Badge tone="danger">异常 · {sample.exceptionId}</Badge>
            <span className="violation-hint">
              {sample.violations.map((v) => VIOLATION_LABEL[v]).join("、")}
            </span>
          </div>
        )}
      </td>
      <td className="nowrap">{fmtDateTime(sample.sampledAt)}</td>
    </tr>
  );
}
