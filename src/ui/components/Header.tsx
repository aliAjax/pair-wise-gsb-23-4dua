export function Header() {
  return (
    <section className="hero">
      <div>
        <p className="eyebrow">hxwl-09 · port 5109 · 粒子采样与恢复放行台</p>
        <h1>半导体洁净室粒子采样与恢复放行</h1>
        <p className="subtitle">
          采样单登记房间、ISO 等级、粒径、计数、采样器编号、校准有效期与班次。
          校准过期、粒径与等级不匹配或计数超限时保留输入并生成异常单，房间进入停用；
          停用期间只能换班复测，连续两次合格后方可放行。放行冻结房间、阈值与读数，
          后续更正须填写原因生成新版本并保留旧值，刷新后全部一致。
        </p>
      </div>
      <div className="stack-card">
        <span>技术栈 / 存储</span>
        <strong>React + Vite + TypeScript + CSS</strong>
        <span>无新增依赖 · localStorage 本地持久化</span>
      </div>
    </section>
  );
}
