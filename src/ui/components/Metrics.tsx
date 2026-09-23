import type { StationState } from "../../domain/types";

interface MetricsProps {
  state: StationState;
}

export function Metrics({ state }: MetricsProps) {
  const openCount = state.exceptions.filter((ticket) => ticket.closedAt === null).length;
  const stopped = Object.values(state.rooms).filter((room) => room.status === "停用").length;
  const inRetest = Object.values(state.rooms).filter(
    (room) => room.status === "停用" && room.streak > 0
  ).length;
  const released = state.releases.length;

  const cards = [
    { label: "进行中异常单", value: openCount, hint: "待复测/复测中", tone: "danger" },
    { label: "停用房间", value: stopped, hint: "仅可换班复测", tone: "warn" },
    { label: "复测推进中", value: inRetest, hint: "至少 1 次合格复测", tone: "watch" },
    { label: "已放行台账", value: released, hint: "冻结记录·版本可追", tone: "ok" },
  ];

  return (
    <section className="metrics-grid">
      {cards.map((card) => (
        <article key={card.label} className="metric-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <em className={`metric-hint metric-${card.tone}`}>{card.hint}</em>
          <i className={`bar bar-${card.tone}`} />
        </article>
      ))}
    </section>
  );
}
