import { ROOM_MAP } from "../../data/reference";
import type { ExceptionTicket } from "../../domain/types";
import { formatStamp } from "../format";

interface ExceptionBoardProps {
  exceptions: ExceptionTicket[];
}

export function ExceptionBoard({ exceptions }: ExceptionBoardProps) {
  const ordered = [...exceptions].sort((a, b) => b.seq - a.seq);
  return (
    <div className="ticket-list">
      {ordered.length === 0 && <p className="empty-cell">暂无异常单</p>}
      {ordered.map((ticket) => {
        const closed = ticket.closedAt !== null;
        return (
          <article key={ticket.id} className={`ticket-card ${closed ? "closed" : "open"}`}>
            <div className="ticket-head">
              <strong className="mono">{ticket.id}</strong>
              <span className={`badge ${closed ? "tone-released" : "tone-danger"}`}>
                {ticket.status}
              </span>
            </div>
            <p className="ticket-room">
              {ticket.roomId} · {ROOM_MAP[ticket.roomId]?.name ?? ""}
            </p>
            <div className="ticket-reasons">
              {ticket.reasons.map((reason) => (
                <span key={reason} className="reason-chip">
                  {reason}
                </span>
              ))}
            </div>
            <p className="ticket-meta">
              来源采样 <span className="mono">{ticket.sampleId}</span> · {ticket.shift} · 开立{" "}
              {formatStamp(ticket.openedAt)}
              {closed && ticket.closedAt ? ` · 关闭 ${formatStamp(ticket.closedAt)}` : ""}
            </p>
          </article>
        );
      })}
    </div>
  );
}
