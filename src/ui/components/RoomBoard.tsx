import { ROOMS } from "../../data/reference";
import type { RoomRuntime } from "../../domain/types";

interface RoomBoardProps {
  rooms: Record<string, RoomRuntime>;
  selectedRoomId: string;
  onSelect: (roomId: string) => void;
  onRelease: (roomId: string) => void;
}

const STATUS_TONE: Record<RoomRuntime["status"], string> = {
  正常: "tone-ok",
  停用: "tone-danger",
  已放行: "tone-released",
};

export function RoomBoard({ rooms, selectedRoomId, onSelect, onRelease }: RoomBoardProps) {
  return (
    <aside className="panel narrow">
      <div className="section-heading">
        <div>
          <p>房间台账</p>
          <h2>采样房间</h2>
        </div>
      </div>
      <div className="room-list">
        {ROOMS.map((info) => {
          const runtime = rooms[info.id];
          const active = info.id === selectedRoomId;
          return (
            <div
              key={info.id}
              role="button"
              tabIndex={0}
              className={`room-card ${active ? "selected" : ""}`}
              onClick={() => onSelect(info.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(info.id);
                }
              }}
            >
              <div className="room-card-head">
                <strong>{info.id}</strong>
                <span className={`badge ${STATUS_TONE[runtime.status]}`}>{runtime.status}</span>
              </div>
              <p>
                {info.name} · {info.zone}
              </p>
              <p className="room-meta">
                <span>{info.isoClass}</span>
                {runtime.status === "停用" && (
                  <span className="retest-count">合格复测 {runtime.streak}/2</span>
                )}
                {runtime.lastShift && <span>上次班次：{runtime.lastShift}</span>}
              </p>
              {runtime.status === "停用" && (
                <button
                  type="button"
                  className="inline-action"
                  disabled={runtime.streak < 2}
                  title={runtime.streak < 2 ? "连续两次合格复测后才可放行" : "放行并冻结"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRelease(info.id);
                  }}
                >
                  {runtime.streak < 2 ? "等待两次合格复测" : "执行放行 →"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
