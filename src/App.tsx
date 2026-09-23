import { useState } from "react";
import "./styles.css";
import { Header } from "./ui/components/Header";
import { Metrics } from "./ui/components/Metrics";
import { RoomBoard } from "./ui/components/RoomBoard";
import { SampleForm } from "./ui/components/SampleForm";
import { RecordsPanel } from "./ui/components/RecordsPanel";
import { useStation } from "./ui/hooks/useStation";

function App() {
  const station = useStation();
  const [selectedRoomId, setSelectedRoomId] = useState("CR-1201");
  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  const runtime =
    station.state.rooms[selectedRoomId] ?? {
      roomId: selectedRoomId,
      status: "正常" as const,
      openExceptionId: null,
      streak: 0,
      lastSampleId: null,
      lastShift: null,
    };

  function handleRelease(roomId: string): string | null {
    setGlobalMessage(null);
    const message = station.release(roomId);
    if (message) {
      setGlobalMessage(message);
      return message;
    }
    setGlobalMessage(`${roomId} 已放行：房间、阈值与读数冻结为放行台账 v1。`);
    return null;
  }

  return (
    <main className="app-shell">
      <Header />
      <Metrics state={station.state} />

      {globalMessage && (
        <p className="form-message message-notice global-message">{globalMessage}</p>
      )}

      <section className="workspace">
        <RoomBoard
          rooms={station.state.rooms}
          selectedRoomId={selectedRoomId}
          onSelect={setSelectedRoomId}
          onRelease={handleRelease}
        />
        <SampleForm
          key={selectedRoomId}
          roomId={selectedRoomId}
          runtime={runtime}
          onSubmit={(input) => {
            setGlobalMessage(null);
            return station.submit(input);
          }}
          onRelease={handleRelease}
        />
      </section>

      <RecordsPanel
        samples={station.state.samples}
        exceptions={station.state.exceptions}
        releases={station.state.releases}
        onCorrect={station.correct}
      />

      <footer className="data-tools">
        <span>数据保存在浏览器 localStorage（hxwl09-particle-station-v1），刷新后采样、停用、复测与版本一致。</span>
        <span className="tool-buttons">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("恢复为内置演示场景？当前本地数据将被覆盖。")) {
                station.resetDemo();
                setGlobalMessage("已恢复演示数据。");
              }
            }}
          >
            恢复演示数据
          </button>
          <button
            type="button"
            className="danger-btn"
            onClick={() => {
              if (window.confirm("清空全部本地采样、异常与放行数据？")) {
                station.clearAll();
                setGlobalMessage("本地数据已清空。");
              }
            }}
          >
            清空本地数据
          </button>
        </span>
      </footer>
    </main>
  );
}

export default App;
