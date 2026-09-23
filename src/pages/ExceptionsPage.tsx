import { useMemo, useState } from "react";
import { useAppState } from "../app/useAppState";
import { fmtDate, fmtDateTime } from "../app/format";
import { VIOLATION_HINT, VIOLATION_LABEL, sizeLabel } from "../domain/reference";
import type { ExceptionTicket, ViolationCode } from "../domain/types";
import { Badge, EmptyState } from "./components";

type Filter = "open" | "closed" | "all";

export function ExceptionsPage({ onJumpRoom }: { onJumpRoom?: (roomId: string) => void }) {
  const { state } = useAppState();
  const [filter, setFilter] = useState<Filter>("open");

  const tickets = useMemo(() => {
    const list = [...state.exceptions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (filter === "all") return list;
    return list.filter((t) => (filter === "open" ? t.open : !t.open));
  }, [state.exceptions, filter]);

  const counts = {
    open: state.exceptions.filter((e) => e.open).length,
    closed: state.exceptions.filter((e) => !e.open).length,
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>异常单</p>
          <h2>采样异常处理</h2>
        </div>
        <div className="filter-tabs">
          {(["open", "closed", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "open" ? `未关闭 (${counts.open})` : f === "closed" ? `已关闭 (${counts.closed})` : `全部 (${state.exceptions.length})`}
            </button>
          ))}
        </div>
      </div>

      {tickets.length === 0 ? (
        <EmptyState>没有符合筛选条件的异常单</EmptyState>
      ) : (
        <div className="ticket-list">
          {tickets.map((ticket) => (
            <ExceptionCard key={ticket.id} ticket={ticket} onJumpRoom={onJumpRoom} />
          ))}
        </div>
      )}
    </section>
  );
}

function ExceptionCard({
  ticket,
  onJumpRoom,
}: {
  ticket: ExceptionTicket;
  onJumpRoom?: (roomId: string) => void;
}) {
  return (
    <article className={`ticket-card ${ticket.open ? "" : "closed"}`}>
      <div className="ticket-head">
        <div>
          <h3>{ticket.id}</h3>
          <span className="ticket-meta">
            {fmtDateTime(ticket.createdAt)} · 关联采样单 {ticket.triggerSampleId}
          </span>
        </div>
        {ticket.open ? <Badge tone="danger">未关闭 · 房间停用中</Badge> : <Badge tone="info">已随放行关闭</Badge>}
      </div>

      <div className="ticket-grid">
        <div>
          <dt>房间</dt>
          <dd>
            {onJumpRoom && ticket.open ? (
              <button type="button" className="link-button" onClick={() => onJumpRoom(ticket.roomId)}>
                {ticket.roomId}
              </button>
            ) : (
              ticket.roomId
            )}
          </dd>
        </div>
        <div>
          <dt>ISO 等级</dt>
          <dd>{ticket.isoClass}</dd>
        </div>
        <div>
          <dt>粒径 / 计数</dt>
          <dd>
            {sizeLabel(ticket.particleSize)} · {ticket.count.toLocaleString("zh-CN")} 粒/m³
          </dd>
        </div>
        <div>
          <dt>采样器</dt>
          <dd>
            {ticket.samplerId}（校准有效期至 {fmtDate(ticket.calibrationDue)}）
          </dd>
        </div>
        <div>
          <dt>班次 / 采样时间</dt>
          <dd>
            {ticket.shift} · {fmtDateTime(ticket.sampledAt)}
          </dd>
        </div>
        {ticket.closedByReleaseId ? (
          <div>
            <dt>关闭来源</dt>
            <dd>{ticket.closedByReleaseId}</dd>
          </div>
        ) : null}
      </div>

      <ul className="violation-list">
        {ticket.violations.map((code: ViolationCode) => (
          <li key={code}>
            <Badge tone="danger">{VIOLATION_LABEL[code]}</Badge>
            <span>{VIOLATION_HINT[code]}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
