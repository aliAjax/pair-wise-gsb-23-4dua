import { useEffect, useMemo, useState } from "react";
import { ISO_LIMITS, PARTICLE_SIZES, ROOM_MAP, SHIFTS } from "../../data/reference";
import { localDate, addDays } from "../../domain/clock";
import { isCalibrationValid, thresholdFor } from "../../domain/judgment";
import type { IsoClass, RoomRuntime, Shift } from "../../domain/types";
import { formatLimit } from "../format";

interface SampleFormProps {
  roomId: string;
  runtime: RoomRuntime;
  onSubmit: (input: {
    roomId: string;
    isoClass: IsoClass;
    particleSize: number;
    count: number;
    samplerId: string;
    calibrationDue: string;
    shift: Shift;
  }) => string | null;
  onRelease: (roomId: string) => string | null;
}

interface FormState {
  particleSize: number;
  countText: string;
  samplerId: string;
  calibrationDue: string;
  shift: Shift;
}

function defaultForm(): FormState {
  return {
    particleSize: 0.5,
    countText: "",
    samplerId: "PC-101",
    calibrationDue: addDays(localDate(new Date()), 365),
    shift: "早班",
  };
}

export function SampleForm({ roomId, runtime, onSubmit, onRelease }: SampleFormProps) {
  const room = ROOM_MAP[roomId];
  const isoClass: IsoClass = room.isoClass;
  const [form, setForm] = useState<FormState>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const today = localDate(new Date());

  // 切换房间：清空提示，恢复默认班次并按该等级选择一个受考核粒径
  useEffect(() => {
    const firstSize = PARTICLE_SIZES.find((size) => thresholdFor(room.isoClass, size) !== undefined);
    setForm({ ...defaultForm(), particleSize: firstSize ?? PARTICLE_SIZES[3] });
    setError(null);
    setNotice(null);
  }, [roomId, room.isoClass]);

  const limit = useMemo(
    () => thresholdFor(isoClass, form.particleSize),
    [isoClass, form.particleSize]
  );
  const count = Number(form.countText);
  const countValid = form.countText.trim() !== "" && Number.isFinite(count) && count >= 0;

  const advisory: { label: string; bad: boolean; text: string }[] = [
    {
      label: "校准有效期",
      bad: !isCalibrationValid(form.calibrationDue, today),
      text: isCalibrationValid(form.calibrationDue, today)
        ? `有效期至 ${form.calibrationDue}`
        : "已过期（判定：校准过期）",
    },
    {
      label: "粒径 / 等级",
      bad: limit === undefined,
      text:
        limit === undefined
          ? `${isoClass} 不考核 ${form.particleSize}μm（粒径与等级不匹配）`
          : `${isoClass} @ ${form.particleSize}μm 限值 ${formatLimit(limit)} 粒/m³`,
    },
    {
      label: "计数判定",
      bad: countValid && limit !== undefined && count > limit,
      text: !countValid
        ? "等待输入计数"
        : limit === undefined
          ? "粒径不匹配，无法比对限值"
          : count > limit
            ? `${count.toLocaleString("zh-CN")} > ${formatLimit(limit)}（计数超限）`
            : `${count.toLocaleString("zh-CN")} ≤ ${formatLimit(limit)}（合格）`,
    },
  ];

  const willBeAbnormal = advisory.some((item) => item.bad);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!countValid) {
      setError("请填写有效的粒子计数（非负数字）");
      return;
    }
    if (!form.samplerId.trim()) {
      setError("请填写采样器编号");
      return;
    }
    if (!form.calibrationDue) {
      setError("请填写校准有效期");
      return;
    }
    const message = onSubmit({
      roomId,
      isoClass,
      particleSize: form.particleSize,
      count,
      samplerId: form.samplerId.trim(),
      calibrationDue: form.calibrationDue,
      shift: form.shift,
    });
    if (message) {
      setError(message);
      return;
    }
    if (willBeAbnormal) {
      setNotice("该采样单判定异常：输入已保留、异常单已生成，房间进入停用。");
    } else if (runtime.status === "停用") {
      setNotice("复测合格已记录，请在另一班次完成第二次复测后放行。");
    } else {
      setNotice("采样单已登记并判定合格。");
    }
    setForm((prev) => ({ ...prev, countText: "" }));
  }

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p>{runtime.status === "停用" ? "停用房间 · 复测登记" : "采样单登记"}</p>
          <h2>
            {roomId} · {room.name}
          </h2>
        </div>
        <span className="badge tone-muted">
          {runtime.status === "停用" ? `合格复测 ${runtime.streak}/2` : isoClass}
        </span>
      </div>

      {runtime.status === "停用" && (
        <div className="banner banner-stop">
          <strong>房间停用中：不得提交正常采样，仅可换班复测。</strong>
          <span>
            上次提交班次为{runtime.lastShift ?? "—"}，本次复测必须选择其他班次；连续两次合格复测后放行。
          </span>
          {runtime.streak >= 2 && (
            <button
              type="button"
              className="primary-action"
              onClick={() => {
                const message = onRelease(roomId);
                if (message) setError(message);
                else setNotice("已放行：房间、阈值与读数已冻结为放行台账 v1。");
              }}
            >
              连续两次合格，立即放行
            </button>
          )}
        </div>
      )}
      {runtime.status === "已放行" && (
        <div className="banner banner-released">
          房间已放行（放行资料已冻结）。可继续登记常规采样；若再次异常，将重新进入停用与复测流程。
        </div>
      )}

      <form className="field-grid" onSubmit={submit}>
        <label>
          <span>房间编号</span>
          <input value={roomId} readOnly />
        </label>
        <label>
          <span>ISO 等级（随房间带出）</span>
          <input value={isoClass} readOnly />
        </label>
        <label>
          <span>粒径（μm）</span>
          <select
            value={form.particleSize}
            onChange={(event) => setForm({ ...form, particleSize: Number(event.target.value) })}
          >
            {PARTICLE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} μm{ISO_LIMITS[isoClass][size] === undefined ? "（该等级不考核）" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>粒子计数（粒/m³）</span>
          <input
            inputMode="numeric"
            placeholder="如 2100"
            value={form.countText}
            onChange={(event) => setForm({ ...form, countText: event.target.value })}
          />
        </label>
        <label>
          <span>采样器编号</span>
          <input
            value={form.samplerId}
            onChange={(event) => setForm({ ...form, samplerId: event.target.value })}
          />
        </label>
        <label>
          <span>校准有效期</span>
          <input
            type="date"
            value={form.calibrationDue}
            onChange={(event) => setForm({ ...form, calibrationDue: event.target.value })}
          />
        </label>
        <label>
          <span>班次{runtime.status === "停用" ? "（复测须换班）" : ""}</span>
          <select
            value={form.shift}
            onChange={(event) => setForm({ ...form, shift: event.target.value as Shift })}
          >
            {SHIFTS.map((shift) => (
              <option key={shift} value={shift}>
                {shift}
                {runtime.status === "停用" && runtime.lastShift === shift ? "（与上次同班）" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="form-action">
          <button type="submit" className="primary-action">
            提交采样单
          </button>
          <p className="form-note">
            异常（校准过期 / 粒径不匹配 / 计数超限）不会阻止提交：输入保留并生成异常单，房间停用。
          </p>
        </div>
      </form>

      <ul className="advisory-list">
        {advisory.map((item) => (
          <li key={item.label} className={item.bad ? "advisory-bad" : "advisory-ok"}>
            <span>{item.label}</span>
            <strong>{item.bad ? "将判异常" : "通过"}</strong>
            <em>{item.text}</em>
          </li>
        ))}
      </ul>

      {error && <p className="form-message message-error">⚠ {error}</p>}
      {notice && <p className="form-message message-notice">{notice}</p>}
    </section>
  );
}
