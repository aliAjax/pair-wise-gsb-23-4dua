import type { ReactNode } from "react";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "ok" | "danger" | "warn" | "info";
  children: ReactNode;
}) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "ok" | "danger" | "warn";
  children: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className={`banner banner-${tone}`} role="status">
      <span>{children}</span>
      {onDismiss ? (
        <button type="button" className="banner-close" onClick={onDismiss} aria-label="关闭提示">
          ×
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
