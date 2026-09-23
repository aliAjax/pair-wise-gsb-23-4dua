import { useState } from "react";
import type { ReleaseRecord, SampleRecord, ExceptionTicket } from "../../domain/types";
import { SampleTable } from "./SampleTable";
import { ExceptionBoard } from "./ExceptionBoard";
import { ReleaseBoard } from "./ReleaseBoard";

type Tab = "samples" | "exceptions" | "releases";

interface RecordsPanelProps {
  samples: SampleRecord[];
  exceptions: ExceptionTicket[];
  releases: ReleaseRecord[];
  onCorrect: (
    releaseId: string,
    change: { sampleId: string; count?: number; samplerId?: string; calibrationDue?: string },
    reason: string
  ) => string | null;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "samples", label: "采样单" },
  { key: "exceptions", label: "异常单" },
  { key: "releases", label: "放行台账（版本）" },
];

export function RecordsPanel({ samples, exceptions, releases, onCorrect }: RecordsPanelProps) {
  const [tab, setTab] = useState<Tab>("samples");
  const openExceptions = exceptions.filter((ticket) => ticket.closedAt === null).length;

  return (
    <section className="records panel">
      <div className="section-heading">
        <div>
          <p>持久化记录 · 刷新后一致</p>
          <h2>采样 / 停用 / 复测 / 放行</h2>
        </div>
        <div className="tab-bar" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={tab === item.key ? "tab active" : "tab"}
              onClick={() => setTab(item.key)}
            >
              {item.label}
              {item.key === "exceptions" && openExceptions > 0 && (
                <span className="tab-count">{openExceptions}</span>
              )}
              {item.key === "releases" && releases.length > 0 && (
                <span className="tab-count">{releases.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === "samples" && <SampleTable samples={samples} />}
      {tab === "exceptions" && <ExceptionBoard exceptions={exceptions} />}
      {tab === "releases" && <ReleaseBoard releases={releases} onCorrect={onCorrect} />}
    </section>
  );
}
