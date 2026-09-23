import { useMemo, useState } from "react";
import "./styles.css";
import { AppStateProvider, useAppState } from "./app/useAppState";
import { SamplingPage } from "./pages/SamplingPage";
import { ExceptionsPage } from "./pages/ExceptionsPage";
import { ReleasesPage } from "./pages/ReleasesPage";
import { LogsPage } from "./pages/LogsPage";
import { Stat } from "./pages/components";
import { STORAGE_KEY } from "./infra/storage";

type Tab = "sampling" | "exceptions" | "releases" | "logs";

const TABS: { key: Tab; label: string }[] = [
  { key: "sampling", label: "采样与房间" },
  { key: "exceptions", label: "异常单" },
  { key: "releases", label: "放行与版本" },
  { key: "logs", label: "采样记录" },
];

function Dashboard() {
  const { state, resetToSeed, clearAll } = useAppState();
  const [tab, setTab] = useState<Tab>("sampling");
  const [prefillRoom, setPrefillRoom] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const active = new Set(
      [...Object.values(state.rooms)].filter((r) => r.status === "active").map((r) => r.roomId)
    ).size;
    const decommissioned = Object.values(state.rooms).filter((r) => r.status === "decommissioned")
      .length;
    const ready = Object.values(state.rooms).filter(
      (r) => r.status === "decommissioned" && r.consecutivePasses >= 2
    ).length;
    const openExceptions = state.exceptions.filter((e) => e.open).length;
    const versions = state.releases.reduce((sum, r) => sum + r.versions.length, 0);
    return {
      active,
      decommissioned,
      ready,
      openExceptions,
      releases: state.releases.length,
      versions,
      samples: state.samples.length,
    };
  }, [state]);

  const jumpToSampling = (roomId: string) => {
    setPrefillRoom(roomId);
    setTab("sampling");
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">hxwl-09 · 粒子采样与恢复放行台</p>
          <h1>半导体洁净室粒子采样与恢复放行</h1>
          <p className="subtitle">
            采样单登记 · 校准/粒径/计数三类异常判定 · 房间停用与换班复测 · 连续两次合格放行冻结 ·
            更正留痕生成新版本，刷新后本地一致
          </p>
        </div>
        <div className="stack-card">
          <span>架构（不加依赖）</span>
          <strong>资料 reference · 判定 rules/store · 本地存储 infra/storage · 页面 pages</strong>
          <span>React + Vite + TypeScript + CSS</span>
        </div>
      </section>

      <section className="metrics-grid">
        <Stat label="在用房间" value={metrics.active} />
        <Stat label="停用房间（待复测/放行）" value={metrics.decommissioned} />
        <Stat label="未关闭异常单" value={metrics.openExceptions} />
        <Stat
          label="放行单 / 版本数"
          value={`${metrics.releases} / ${metrics.versions}`}
        />
      </section>

      <section className="metrics-grid subtle">
        <Stat label="累计采样单" value={metrics.samples} />
        <Stat label="已达连续 2 次合格 · 可放行" value={metrics.ready} />
        <Stat label="本地存储键" value={<code className="storage-key">{STORAGE_KEY}</code>} />
        <article className="metric-card storage-actions">
          <span>本地数据</span>
          <div className="storage-buttons">
            <button type="button" onClick={resetToSeed}>重置为演示数据</button>
            <button type="button" className="danger-outline" onClick={clearAll}>清空业务数据</button>
          </div>
        </article>
      </section>

      <nav className="tabs" aria-label="功能页签">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? "active" : ""}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "sampling" ? (
        <SamplingPage prefillRoom={prefillRoom} onConsumePrefill={() => setPrefillRoom(null)} />
      ) : null}
      {tab === "exceptions" ? <ExceptionsPage onJumpRoom={jumpToSampling} /> : null}
      {tab === "releases" ? <ReleasesPage /> : null}
      {tab === "logs" ? <LogsPage /> : null}
    </main>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <Dashboard />
    </AppStateProvider>
  );
}
