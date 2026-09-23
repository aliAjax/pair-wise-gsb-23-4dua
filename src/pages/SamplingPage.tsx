import { useEffect, useMemo, useState } from "react";
import { useAppState } from "../app/useAppState";
import { daysUntil, fmtDateTime, nowLocalInput } from "../app/format";
import {
  ALL_SIZES,
  ISO_CLASSES,
  ROOM_DIRECTORY,
  SHIFTS,
  VIOLATION_HINT,
  VIOLATION_LABEL,
  findRoomDirectory,
  limitText,
  sizeLabel,
} from "../domain/reference";
import {
  evaluateViolations,
  isReleaseAllowed,
  validateSamplingForm,
} from "../domain/rules";
import { getRoom } from "../domain/store";
import type {
  IsoClass,
  ParticleSize,
  RoomRuntime,
  SamplingFormValues,
  Shift,
  ViolationCode,
} from "../domain/types";
import { Badge, Banner, EmptyState } from "./components";

const ROOM_STATUS_TEXT: Record<RoomRuntime["status"], { text: string; tone: "ok" | "danger" | "info" }> = {
  active: { text: "在用", tone: "ok" },
  decommissioned: { text: "已停用", tone: "danger" },
  released: { text: "已放行（冻结）", tone: "info" },
};

function defaultValues(): SamplingFormValues {
  return {
    roomId: "",
    isoClass: "",
    particleSize: null,
    count: "",
    samplerId: "",
    calibrationDue: "",
    shift: "",
    sampledAt: nowLocalInput(new Date()),
  };
}

export function SamplingPage({
  prefillRoom,
  onConsumePrefill,
}: {
  prefillRoom?: string | null;
  onConsumePrefill?: () => void;
}) {
  const { state, submit, release } = useAppState();
  const [values, setValues] = useState<SamplingFormValues>(defaultValues);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const now = new Date();

  useEffect(() => {
    if (prefillRoom) {
      const entry = findRoomDirectory(prefillRoom);
      setValues((v) => ({
        ...v,
        roomId: prefillRoom,
        isoClass: entry?.isoClass ?? v.isoClass,
        sampledAt: nowLocalInput(new Date()),
      }));
      setFieldErrors([]);
      onConsumePrefill?.();
    }
    // 仅响应外部跳转带入的房间号
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillRoom]);

  const roomKey = values.roomId.trim().toUpperCase();
  const runtime = roomKey ? getRoom(state, roomKey) : undefined;
  const directory = findRoomDirectory(roomKey);

  const liveViolations = useMemo<ViolationCode[]>(() => {
    if (!values.isoClass || values.particleSize === null || !values.calibrationDue) return [];
    return evaluateViolations(
      {
        isoClass: values.isoClass as IsoClass,
        particleSize: values.particleSize,
        count: values.count,
        calibrationDue: values.calibrationDue,
      },
      now
    );
    // now 随渲染生成，可安全省略
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.isoClass, values.particleSize, values.count, values.calibrationDue]);

  const update = <K extends keyof SamplingFormValues>(key: K, val: SamplingFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: val }));

  const pickRoom = (roomId: string) => {
    const entry = findRoomDirectory(roomId);
    setValues((v) => ({ ...v, roomId, isoClass: entry?.isoClass ?? v.isoClass }));
    setFeedback(null);
    setFieldErrors([]);
  };

  const handleSubmit = () => {
    setFieldErrors([]);
    const validation = validateSamplingForm(values);
    if (validation.errors.length > 0) {
      setFieldErrors(validation.errors);
      setFeedback({ tone: "danger", text: "采样单填写不完整，请检查后再提交" });
      return;
    }
    const result = submit(values);
    if (!result.ok) {
      setFieldErrors(result.errors || []);
      setFeedback({ tone: "danger", text: "提交被规则拦截" });
      return;
    }
    const violations = evaluateViolations(
      {
        isoClass: values.isoClass as IsoClass,
        particleSize: values.particleSize as ParticleSize,
        count: values.count,
        calibrationDue: values.calibrationDue,
      },
      new Date()
    );
    if (violations.length > 0) {
      setFeedback({
        tone: "danger",
        text: `已保留输入并生成异常单，房间 ${roomKey} 进入停用。异常：${violations
          .map((c) => VIOLATION_LABEL[c])
          .join("、")}。复测只能换班。`,
      });
    } else {
      const room = getRoom(state, roomKey);
      if (room.status === "decommissioned") {
        const passes = room.consecutivePasses + 1;
        setFeedback({
          tone: "ok",
          text:
            passes >= 2
              ? `复测合格，连续合格已达 2 次，房间 ${roomKey} 可在右侧执行放行。`
              : `复测合格，连续合格 ${passes}/2，仍需在其他班次再完成一次合格复测。`,
        });
      } else {
        setFeedback({ tone: "ok", text: `采样单提交合格，房间 ${roomKey} 状态正常。` });
      }
    }
    setValues(defaultValues());
  };

  const calibDays = values.calibrationDue ? daysUntil(values.calibrationDue, now) : null;

  const boardRooms = useMemo(() => {
    const keys = new Set<string>([
      ...ROOM_DIRECTORY.map((r) => r.roomId),
      ...Object.keys(state.rooms),
    ]);
    return [...keys].sort();
  }, [state.rooms]);

  const openExceptionCount = (roomId: string) =>
    state.exceptions.filter((e) => e.roomId === roomId && e.open).length;

  const handleRelease = (roomId: string) => {
    const result = release(roomId);
    if (!result.ok) {
      setFeedback({ tone: "danger", text: `${roomId} 放行失败：${(result.errors || []).join("；")}` });
    } else {
      setFeedback({
        tone: "ok",
        text: `${roomId} 已放行：房间、阈值与两次复测读数已冻结，放行单编号 ${result.data?.id}。`,
      });
    }
  };

  const isRetest = runtime?.status === "decommissioned";
  const shiftBlocked =
    isRetest && values.shift !== "" && runtime?.lastShift === (values.shift as Shift);

  return (
    <div className="two-col">
      <section className="panel">
        <div className="section-heading">
          <div>
            <p>采样单登记</p>
            <h2>粒子采样</h2>
          </div>
          {isRetest ? <Badge tone="danger">复测模式 · 必须换班</Badge> : <Badge>正常采样</Badge>}
        </div>

        {feedback ? (
          <Banner tone={feedback.tone} onDismiss={() => setFeedback(null)}>
            {feedback.text}
          </Banner>
        ) : null}
        {fieldErrors.length > 0 ? (
          <ul className="error-list">
            {fieldErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        {runtime?.status === "released" ? (
          <Banner tone="warn">
            该房间已放行冻结，停用/放行期间不得提交正常采样；如需更正读数请前往「放行与版本」发起版本更正。
          </Banner>
        ) : null}
        {isRetest ? (
          <div className="inline-hint">
            房间处于停用状态，本次提交将记为复测；上次采样班次为
            <strong> {runtime?.lastShift || "—"}</strong>，复测班次必须不同。
          </div>
        ) : null}
        {shiftBlocked ? (
          <Banner tone="warn">复测班次与上次相同，提交将被拦截。</Banner>
        ) : null}

        <div className="form-grid">
          <label className="span-2">
            <span>房间编号</span>
            <input
              list="room-directory"
              value={values.roomId}
              placeholder="如 CR-1201，可从目录选择或登记新房间"
              onChange={(e) => update("roomId", e.target.value)}
            />
            <datalist id="room-directory">
              {ROOM_DIRECTORY.map((r) => (
                <option key={r.roomId} value={r.roomId}>
                  {r.isoClass} · {r.zone}
                </option>
              ))}
            </datalist>
            {directory ? (
              <small className="field-hint">
                目录资料：{directory.isoClass} · {directory.zone} · {directory.note}
              </small>
            ) : roomKey ? (
              <small className="field-hint">未在房间目录中，提交时将以填报等级自动建档。</small>
            ) : null}
          </label>

          <label>
            <span>ISO 等级</span>
            <select value={values.isoClass} onChange={(e) => update("isoClass", e.target.value as IsoClass | "")}>
              <option value="">请选择</option>
              {ISO_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label>
            <span>粒子粒径</span>
            <select
              value={values.particleSize ?? ""}
              onChange={(e) =>
                update("particleSize", e.target.value === "" ? null : (Number(e.target.value) as ParticleSize))
              }
            >
              <option value="">请选择</option>
              {ALL_SIZES.map((s) => (
                <option key={s} value={s}>{sizeLabel(s)}</option>
              ))}
            </select>
            {values.isoClass && values.particleSize !== null ? (
              limitText(values.isoClass as IsoClass, values.particleSize) ? (
                <small className="field-hint ok">
                  适用限值：{limitText(values.isoClass as IsoClass, values.particleSize)}
                </small>
              ) : (
                <small className="field-hint danger">
                  粒径 {sizeLabel(values.particleSize)} 不适用于 {values.isoClass}，提交将生成异常单
                </small>
              )
            ) : null}
          </label>

          <label>
            <span>粒子计数（粒/m³）</span>
            <input
              inputMode="numeric"
              value={values.count}
              placeholder="非负整数"
              onChange={(e) => update("count", e.target.value)}
            />
          </label>

          <label>
            <span>采样器编号</span>
            <input
              value={values.samplerId}
              placeholder="如 LPC-101"
              onChange={(e) => update("samplerId", e.target.value)}
            />
          </label>

          <label>
            <span>校准有效期</span>
            <input
              type="date"
              value={values.calibrationDue}
              onChange={(e) => update("calibrationDue", e.target.value)}
            />
            {calibDays !== null ? (
              <small className={`field-hint ${calibDays < 0 ? "danger" : "ok"}`}>
                {calibDays < 0
                  ? `已过期 ${Math.abs(calibDays)} 天，提交将判定校准过期`
                  : calibDays === 0
                    ? "校准今日到期（仍有效）"
                    : `距到期 ${calibDays} 天`}
              </small>
            ) : null}
          </label>

          <label>
            <span>班次</span>
            <select value={values.shift} onChange={(e) => update("shift", e.target.value as Shift | "")}>
              <option value="">请选择</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="span-2">
            <span>采样时间</span>
            <input
              type="datetime-local"
              value={values.sampledAt}
              onChange={(e) => update("sampledAt", e.target.value)}
            />
          </label>
        </div>

        {liveViolations.length > 0 ? (
          <div className="violation-preview">
            <strong>实时预检将触发异常：</strong>
            <ul>
              {liveViolations.map((code) => (
                <li key={code}>
                  <Badge tone="danger">{VIOLATION_LABEL[code]}</Badge>
                  <span className="violation-hint">{VIOLATION_HINT[code]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="form-actions">
          <button type="button" className="primary-action" onClick={handleSubmit}>
            {isRetest ? "提交复测单" : "提交采样单"}
          </button>
          <button
            type="button"
            onClick={() => {
              setValues(defaultValues());
              setFieldErrors([]);
              setFeedback(null);
            }}
          >
            清空
          </button>
          <span className="form-note">
            异常提交不会丢弃输入：原始值写入采样记录并生成异常单，房间随即停用。
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p>房间状态</p>
            <h2>停用 / 复测 / 放行</h2>
          </div>
        </div>
        <div className="room-board">
          {boardRooms.map((roomId) => {
            const entry = findRoomDirectory(roomId);
            const room = getRoom(state, roomId);
            const meta = ROOM_STATUS_TEXT[room.status];
            const canRelease = isReleaseAllowed(room.status, room.consecutivePasses);
            const openCount = openExceptionCount(roomId);
            return (
              <article
                key={roomId}
                className={`room-card room-${room.status} ${roomKey === roomId ? "selected" : ""}`}
              >
                <div className="room-card-head">
                  <button type="button" className="room-link" onClick={() => pickRoom(roomId)}>
                    <h3>{roomId}</h3>
                  </button>
                  <Badge tone={meta.tone}>{meta.text}</Badge>
                </div>
                <p className="room-meta">
                  {entry ? `${entry.isoClass} · ${entry.zone} · ${entry.note}` : "运行时自动建档"}
                  {openCount > 0 ? (
                    <>
                      {" "}
                      · <Badge tone="danger">未关闭异常 ×{openCount}</Badge>
                    </>
                  ) : null}
                </p>
                <dl className="room-facts">
                  <div>
                    <dt>上次班次</dt>
                    <dd>{room.lastShift || "—"}</dd>
                  </div>
                  <div>
                    <dt>连续合格复测</dt>
                    <dd>
                      {room.status === "decommissioned" ? `${room.consecutivePasses}/2` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>停用时间</dt>
                    <dd>{room.decommissionedAt ? fmtDateTime(room.decommissionedAt) : "—"}</dd>
                  </div>
                </dl>
                <div className="room-actions">
                  {room.status === "decommissioned" ? (
                    <>
                      <button
                        type="button"
                        className="primary-action"
                        disabled={!canRelease.allowed}
                        title={canRelease.allowed ? "冻结房间、阈值与读数并放行" : canRelease.reason}
                        onClick={() => handleRelease(roomId)}
                      >
                        放行
                      </button>
                      <button type="button" onClick={() => pickRoom(roomId)}>
                        去复测
                      </button>
                    </>
                  ) : room.status === "released" ? (
                    <span className="frozen-note">
                      已于 {room.releasedAt ? fmtDateTime(room.releasedAt) : "—"} 冻结放行
                    </span>
                  ) : (
                    <span className="frozen-note">可提交正常采样</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {boardRooms.length === 0 ? <EmptyState>暂无房间资料</EmptyState> : null}
      </section>
    </div>
  );
}
