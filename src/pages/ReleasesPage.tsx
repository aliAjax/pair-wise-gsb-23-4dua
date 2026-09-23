import { useMemo, useState } from "react";
import { useAppState } from "../app/useAppState";
import { fmtDateTime } from "../app/format";
import { sizeLabel } from "../domain/reference";
import type { ParticleSize, ReleaseRecord } from "../domain/types";
import { Badge, Banner, EmptyState } from "./components";

export function ReleasesPage() {
  const { state } = useAppState();
  const releases = useMemo(
    () => [...state.releases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.releases]
  );

  return (
    <div className="release-list">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>放行与版本</p>
            <h2>冻结放行单</h2>
          </div>
          <Badge tone="info">放行冻结房间、阈值与读数</Badge>
        </div>
        {releases.length === 0 ? (
          <EmptyState>尚无放行记录。停用房间连续两次合格复测后可在「采样与房间」页放行。</EmptyState>
        ) : (
          <div className="release-cards">
            {releases.map((record) => (
              <ReleaseCard key={record.id} record={record} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ReleaseCard({ record }: { record: ReleaseRecord }) {
  const { correct } = useAppState();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [editor, setEditor] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);

  const latest = record.versions[record.versions.length - 1];

  const submitCorrection = () => {
    setErrors([]);
    setDone(null);
    const readings = latest.readings.map((r, i) => ({
      size: r.size as ParticleSize,
      count: Number(drafts[i] ?? r.count),
    }));
    const result = correct(record.id, { reason, editor, readings });
    if (!result.ok) {
      setErrors(result.errors || []);
      return;
    }
    setDone(`已生成 v${result.data?.versions.length}，旧版本全部保留。`);
    setReason("");
    setEditor("");
    setDrafts({});
    setOpen(false);
  };

  return (
    <article className="release-card">
      <div className="ticket-head">
        <div>
          <h3>{record.id} · {record.roomId}</h3>
          <span className="ticket-meta">
            {record.isoClass} · 放行于 {fmtDateTime(record.createdAt)} · 复测单{" "}
            {record.retestSampleIds.join(" / ")}
          </span>
        </div>
        <Badge tone="ok">当前 v{latest.version}</Badge>
      </div>

      <div className="freeze-grid">
        <div>
          <h4>冻结阈值（{record.isoClass}）</h4>
          <table className="data-table compact">
            <thead>
              <tr><th>粒径</th><th>限值（粒/m³）</th></tr>
            </thead>
            <tbody>
              {record.thresholds.map((t) => (
                <tr key={t.size}>
                  <td>{sizeLabel(t.size)}</td>
                  <td>≤ {t.limit.toLocaleString("zh-CN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>放行读数基线（两次复测）</h4>
          <table className="data-table compact">
            <thead>
              <tr><th>粒径</th><th>计数</th><th>判定</th></tr>
            </thead>
            <tbody>
              {latest.readings.map((r, i) => (
                <tr key={`${r.size}-${i}`}>
                  <td>
                    第 {i + 1} 次 · {sizeLabel(r.size)}
                  </td>
                  <td>{r.count.toLocaleString("zh-CN")}</td>
                  <td>{r.count <= r.limit ? <Badge tone="ok">合格</Badge> : <Badge tone="danger">超限</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="field-hint">采样器：{record.samplerIds.join(" / ")}</p>
        </div>
      </div>

      <div className="version-head">
        <h4>版本链（共 {record.versions.length} 个版本，旧值完整保留）</h4>
        <button type="button" className="primary-action ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "收起更正" : "发起更正（新版本）"}
        </button>
      </div>

      {done ? <Banner tone="ok">{done}</Banner> : null}
      {errors.length > 0 ? (
        <ul className="error-list">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      ) : null}

      <ol className="version-list">
        {[...record.versions].reverse().map((version) => (
          <li key={version.version} className={version.version === latest.version ? "latest" : ""}>
            <div className="version-meta">
              <Badge tone={version.version === latest.version ? "ok" : "neutral"}>
                v{version.version}
              </Badge>
              <span>{fmtDateTime(version.createdAt)} · 操作人：{version.editor}</span>
            </div>
            <p className="version-reason">{version.reason}</p>
            <table className="data-table compact">
              <thead>
                <tr><th>粒径</th><th>计数（粒/m³）</th></tr>
              </thead>
              <tbody>
                {version.readings.map((r, i) => {
                  const changed =
                    version.version !== latest.version &&
                    latest.readings[i]?.count !== r.count;
                  return (
                    <tr key={`${version.version}-${r.size}-${i}`}>
                      <td>
                        第 {i + 1} 次 · {sizeLabel(r.size)}
                      </td>
                      <td>
                        {r.count.toLocaleString("zh-CN")}
                        {changed ? <span className="superseded">（已被新版本更正）</span> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </li>
        ))}
      </ol>

      {open ? (
        <div className="correction-form">
          <p className="inline-hint">
            更正只能修改读数计数，粒径集合与冻结阈值不变；更正后读数仍须满足放行阈值。
          </p>
          <div className="form-grid">
            {latest.readings.map((r, i) => (
              <label key={`${r.size}-${i}`}>
                <span>
                  第 {i + 1} 次复测 · {sizeLabel(r.size)} 读数（限值 ≤ {r.limit.toLocaleString("zh-CN")}）
                </span>
                <input
                  inputMode="numeric"
                  value={drafts[i] ?? String(r.count)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                />
              </label>
            ))}
            <label>
              <span>更正人</span>
              <input value={editor} onChange={(e) => setEditor(e.target.value)} placeholder="如 班组长-周敏" />
            </label>
            <label className="span-2">
              <span>更正原因（必填）</span>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="说明为何放行后仍需更正，旧值将保留在版本链中"
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="button" className="primary-action" onClick={submitCorrection}>
              生成 v{latest.version + 1}
            </button>
            <button type="button" onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
