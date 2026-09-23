import { useState } from "react";
import type { FrozenReading, ReleaseRecord } from "../../domain/types";
import { formatCount, formatLimit, formatStamp, stampDate } from "../format";

interface ReleaseBoardProps {
  releases: ReleaseRecord[];
  onCorrect: (releaseId: string, change: {
    sampleId: string;
    count?: number;
    samplerId?: string;
    calibrationDue?: string;
  }, reason: string) => string | null;
}

function ReadingRow({ reading }: { reading: FrozenReading }) {
  return (
    <tr className={reading.verdict === "异常" ? "row-abnormal" : ""}>
      <td className="mono">{reading.sampleId}</td>
      <td>{reading.kind}</td>
      <td>{reading.shift}</td>
      <td>{reading.particleSize}μm</td>
      <td className="num">{formatCount(reading.count)}</td>
      <td className="num">{formatLimit(reading.limit)}</td>
      <td>
        {reading.samplerId}
        <small>校准至 {reading.calibrationDue}</small>
      </td>
      <td>
        {reading.verdict === "合格" ? (
          <span className="badge tone-ok">合格</span>
        ) : (
          <span className="badge tone-danger" title={reading.reasons.join("、")}>
            {reading.reasons.join("/")}
          </span>
        )}
      </td>
    </tr>
  );
}

function ThresholdSummary({ thresholds }: { thresholds: Partial<Record<number, number>> }) {
  return (
    <p className="threshold-line">
      冻结阈值（粒/m³）：
      {Object.entries(thresholds).map(([size, limit]) => (
        <span key={size}>
          {size}μm ≤ {formatLimit(limit ?? null)}
        </span>
      ))}
    </p>
  );
}

export function ReleaseBoard({ releases, onCorrect }: ReleaseBoardProps) {
  const ordered = [...releases].sort((a, b) => b.seq - a.seq);

  if (ordered.length === 0) {
    return <p className="empty-cell">暂无放行记录</p>;
  }

  return (
    <div className="release-list">
      {ordered.map((release) => (
        <ReleaseCard key={release.id} release={release} onCorrect={onCorrect} />
      ))}
    </div>
  );
}

function ReleaseCard({
  release,
  onCorrect,
}: {
  release: ReleaseRecord;
  onCorrect: ReleaseBoardProps["onCorrect"];
}) {
  const latest = release.versions[release.versions.length - 1];
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function handleCorrect(
    sampleId: string,
    patch: { count?: number; samplerId?: string; calibrationDue?: string },
    reason: string
  ) {
    setError(null);
    setDone(null);
    const message = onCorrect(release.id, { sampleId, ...patch }, reason);
    if (message) {
      setError(message);
      return;
    }
    setDone(`已基于冻结阈值生成 v${latest.version + 1}，旧值保留在版本链中。`);
  }

  return (
    <article className="release-card">
      <div className="ticket-head">
        <div>
          <strong className="mono">{release.id}</strong>
          <h3>
            {release.roomId} · {release.roomName} · {release.isoClass}
          </h3>
        </div>
        <span className="badge tone-released">
          已放行 · 当前 v{latest.version}
        </span>
      </div>

      <div className="version-stack">
        {[...release.versions].reverse().map((version, reverseIndex) => {
          const isLatest = reverseIndex === 0;
          return (
            <section key={version.version} className={`version-block ${isLatest ? "latest" : "old"}`}>
              <div className="version-head">
                <strong>v{version.version}</strong>
                <span>{formatStamp(version.createdAt)}</span>
                <em>{isLatest ? (version.version === 1 ? "放行冻结（当前）" : "当前版本") : "历史版本（只读）"}</em>
              </div>
              <p className="version-reason">
                {version.version === 1 ? "放行说明：" : "更正原因："}
                {version.reason}
              </p>
              <ThresholdSummary thresholds={version.thresholds} />
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>采样单</th>
                    <th>类型</th>
                    <th>班次</th>
                    <th>粒径</th>
                    <th className="num">计数</th>
                    <th className="num">限值</th>
                    <th>采样器/校准</th>
                    <th>判定</th>
                  </tr>
                </thead>
                <tbody>
                  {version.readings.map((reading) => (
                    <ReadingRow
                      key={`${version.version}-${reading.sampleId}`}
                      reading={reading}
                    />
                  ))}
                </tbody>
              </table>
              {isLatest && (
                <CorrectionEditor
                  release={release}
                  onCorrect={handleCorrect}
                />
              )}
            </section>
          );
        })}
      </div>

      {error && <p className="form-message message-error">⚠ {error}</p>}
      {done && <p className="form-message message-notice">{done}</p>}
    </article>
  );
}

function CorrectionEditor({
  release,
  onCorrect,
}: {
  release: ReleaseRecord;
  onCorrect: (
    sampleId: string,
    patch: { count?: number; samplerId?: string; calibrationDue?: string },
    reason: string
  ) => void;
}) {
  const latest = release.versions[release.versions.length - 1];
  const [sampleId, setSampleId] = useState(latest.readings[0]?.sampleId ?? "");
  const [field, setField] = useState<"count" | "samplerId" | "calibrationDue">("samplerId");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const releaseDate = stampDate(release.versions[0].createdAt);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!sampleId) return;
    if (field === "count") {
      const count = Number(value);
      if (value.trim() === "" || !Number.isFinite(count) || count < 0) {
        setLocalError("请填写有效的非负计数");
        return;
      }
      onCorrect(sampleId, { count }, reason);
    } else if (field === "samplerId") {
      if (!value.trim()) {
        setLocalError("请填写新的采样器编号");
        return;
      }
      onCorrect(sampleId, { samplerId: value.trim() }, reason);
    } else {
      if (!value) {
        setLocalError("请选择新的校准有效期");
        return;
      }
      onCorrect(sampleId, { calibrationDue: value }, reason);
    }
    setValue("");
    setReason("");
  }

  return (
    <form className="correction-form" onSubmit={submit}>
      <p className="correction-title">登记更正（以放行日期 {releaseDate} 与冻结阈值重新判定，生成新版本并保留旧值）</p>
      <div className="correction-grid">
        <label>
          <span>更正读数</span>
          <select value={sampleId} onChange={(event) => setSampleId(event.target.value)}>
            {latest.readings.map((reading) => (
              <option key={reading.sampleId} value={reading.sampleId}>
                {reading.sampleId}（{reading.kind} · {reading.shift} · {reading.particleSize}μm）
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>更正字段</span>
          <select value={field} onChange={(event) => {
            setField(event.target.value as typeof field);
            setValue("");
          }}>
            <option value="samplerId">采样器编号</option>
            <option value="count">粒子计数</option>
            <option value="calibrationDue">校准有效期</option>
          </select>
        </label>
        <label>
          <span>新值</span>
          {field === "count" ? (
            <input
              inputMode="numeric"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : field === "calibrationDue" ? (
            <input
              type="date"
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          ) : (
            <input
              required
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          )}
        </label>
        <label className="correction-reason">
          <span>更正原因（必填）</span>
          <input
            required
            value={reason}
            placeholder="如：采样器编号登记有误"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <div className="form-action">
          <button type="submit" className="primary-action">
            生成新版本
          </button>
        </div>
      </div>
      {localError && <p className="form-message message-error">⚠ {localError}</p>}
    </form>
  );
}
