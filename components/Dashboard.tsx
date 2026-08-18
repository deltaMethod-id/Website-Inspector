"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SourceViewer from "./SourceViewer";
import type {
  InspectedResource,
  InspectionOptions,
  InspectionReport,
  ResourceType,
} from "@/lib/types";
import { DEFAULT_INSPECTION_OPTIONS } from "@/lib/types";

const RESOURCE_FILTERS: Array<ResourceType | "ALL"> = [
  "ALL",
  "HTML",
  "CSS",
  "JS",
  "JSON",
  "IMAGE",
  "FONT",
  "XML",
  "OTHER",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function Dashboard() {
  const router = useRouter();

  const [target, setTarget] = useState("");
  const [options, setOptions] = useState<InspectionOptions>(DEFAULT_INSPECTION_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);

  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [report, setReport] = useState<InspectionReport | null>(null);

  const [filter, setFilter] = useState<ResourceType | "ALL">("ALL");
  const [selectedResource, setSelectedResource] = useState<InspectedResource | null>(null);
  const [locking, setLocking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const filteredResources = useMemo(() => {
    if (!report) return [];
    if (filter === "ALL") return report.resources;
    return report.resources.filter((r) => r.type === filter);
  }, [report, filter]);

  async function handleInspect() {
    if (!target.trim()) return;
    setStatus("scanning");
    setErrorMessage("");
    setReport(null);
    try {
      const res = await fetch("/api/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, ...options }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMessage(data.message || "Inspection failed.");
        return;
      }
      setReport(data.report);
      setStatus("done");
    } catch {
      setStatus("error");
      setErrorMessage("Network error while inspecting target.");
    }
  }

  async function handleLock() {
    setLocking(true);
    try {
      await fetch("/api/wipas/lock", { method: "POST" });
    } finally {
      router.push("/wipas");
      router.refresh();
    }
  }

  async function handleExportZip() {
    if (!report) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const host = (() => {
        try {
          return new URL(report.target).hostname;
        } catch {
          return "inspected-site";
        }
      })();
      a.href = url;
      a.download = `${host}-inspected.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="dash-shell">
      <header className="dash-header glass-panel">
        <div>
          <div className="dash-title neon-text">WEBSITE INSPECTOR</div>
          <div className="mono-label">PUBLIC RESOURCE INSPECTION CONSOLE</div>
        </div>
        <button className="btn btn-ghost" onClick={handleLock} disabled={locking}>
          {locking ? "LOCKING…" : "LOCK WIPAS"}
        </button>
      </header>

      <section className="glass-panel target-panel">
        <label className="mono-label" htmlFor="target-input">
          Target
        </label>
        <div className="target-row">
          <input
            id="target-input"
            className="input-field"
            placeholder="https://example.com"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInspect()}
          />
          <button
            className="btn btn-primary target-submit"
            onClick={handleInspect}
            disabled={status === "scanning" || !target.trim()}
          >
            {status === "scanning" ? "SCANNING…" : "INSPECT WEBSITE →"}
          </button>
        </div>

        <button
          className="btn btn-ghost options-toggle"
          onClick={() => setShowOptions((v) => !v)}
          type="button"
        >
          {showOptions ? "HIDE CRAWL OPTIONS" : "SHOW CRAWL OPTIONS"}
        </button>

        {showOptions && (
          <div className="options-grid fade-in">
            <label className="option-field">
              <span className="mono-label">Maximum Pages</span>
              <input
                type="number"
                min={1}
                max={30}
                className="input-field"
                value={options.maxPages}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, maxPages: Number(e.target.value) }))
                }
              />
            </label>
            <label className="option-field">
              <span className="mono-label">Maximum Crawl Depth</span>
              <input
                type="number"
                min={0}
                max={5}
                className="input-field"
                value={options.maxDepth}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, maxDepth: Number(e.target.value) }))
                }
              />
            </label>
            <label className="option-field">
              <span className="mono-label">Request Timeout (ms)</span>
              <input
                type="number"
                min={1000}
                max={20000}
                step={500}
                className="input-field"
                value={options.timeoutMs}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, timeoutMs: Number(e.target.value) }))
                }
              />
            </label>
            <label className="option-field option-toggle">
              <span className="mono-label">Same-Origin Only</span>
              <input
                type="checkbox"
                checked={options.sameOriginOnly}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, sameOriginOnly: e.target.checked }))
                }
              />
            </label>
            <label className="option-field option-toggle">
              <span className="mono-label">Respect robots.txt</span>
              <input
                type="checkbox"
                checked={options.respectRobots}
                onChange={(e) =>
                  setOptions((o) => ({ ...o, respectRobots: e.target.checked }))
                }
              />
            </label>
          </div>
        )}
      </section>

      {status === "scanning" && (
        <section className="glass-panel scan-indicator scanning-panel fade-in">
          <span className="status-dot" /> Inspecting target — crawling public resources…
        </section>
      )}

      {status === "error" && (
        <section className="glass-panel error-panel fade-in">
          <strong className="neon-text">INSPECTION ERROR</strong>
          <p>{errorMessage}</p>
        </section>
      )}

      {status === "idle" && !report && (
        <section className="glass-panel empty-panel fade-in">
          <p className="mono-label">NO INSPECTION YET</p>
          <p>Enter a public target URL above and press INSPECT WEBSITE to begin.</p>
        </section>
      )}

      {report && (
        <div className="fade-in">
          <section className="stats-grid">
            <StatCard label="Pages" value={report.stats.pages} />
            <StatCard label="Files" value={report.stats.files} />
            <StatCard label="Total" value={formatBytes(report.stats.totalSizeBytes)} />
            <StatCard label="JavaScript" value={report.stats.javascript} />
            <StatCard label="CSS" value={report.stats.css} />
            <StatCard label="Images" value={report.stats.images} />
            <StatCard label="Fonts" value={report.stats.fonts} />
            <StatCard label="Inspection Time" value={`${report.stats.inspectionTimeMs} ms`} />
          </section>

          {(report.errors.length > 0 || report.limitsReached.length > 0) && (
            <section className="glass-panel notice-panel">
              {report.limitsReached.length > 0 && (
                <p>
                  <strong className="neon-text">LIMITS REACHED:</strong>{" "}
                  {report.limitsReached.join(", ")}
                </p>
              )}
              {report.errors.length > 0 && (
                <details>
                  <summary className="mono-label">
                    {report.errors.length} ERROR(S) DURING INSPECTION
                  </summary>
                  <ul className="error-list">
                    {report.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          <div className="dash-grid">
            <aside className="glass-panel resource-sidebar">
              <div className="mono-label sidebar-heading">Resources</div>
              <div className="filter-row">
                {RESOURCE_FILTERS.map((f) => (
                  <button
                    key={f}
                    className={`filter-chip ${filter === f ? "filter-chip-active" : ""}`}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="resource-list">
                {filteredResources.length === 0 && (
                  <p className="mono-label empty-note">NO RESOURCES OF THIS TYPE</p>
                )}
                {filteredResources.map((r) => (
                  <button
                    key={r.id}
                    className="resource-item"
                    onClick={() => setSelectedResource(r)}
                  >
                    <span className="resource-type-tag">[{r.type}]</span>
                    <span className="resource-url">
                      {(() => {
                        try {
                          const u = new URL(r.url);
                          return u.pathname + u.search || "/";
                        } catch {
                          return r.url;
                        }
                      })()}
                    </span>
                    <span className="mono-label resource-meta">
                      {r.status} • {formatBytes(r.size)}
                    </span>
                  </button>
                ))}
              </div>
            </aside>

            <div className="dash-main">
              <section className="glass-panel metadata-panel">
                <div className="mono-label sidebar-heading">Metadata</div>
                <MetaRow label="Title" value={report.metadata.title} />
                <MetaRow label="Description" value={report.metadata.description} />
                <MetaRow label="OG Title" value={report.metadata.ogTitle} />
                <MetaRow label="OG Description" value={report.metadata.ogDescription} />
                <MetaRow label="Canonical" value={report.metadata.canonical} />
                <MetaRow label="Robots" value={report.metadata.robots} />
                <MetaRow label="Sitemap" value={report.metadata.sitemap} />
              </section>

              <section className="glass-panel pages-panel">
                <div className="mono-label sidebar-heading">Pages</div>
                <div className="pages-list">
                  {report.pages.map((p) => (
                    <div key={p.url} className="page-row">
                      <span className={`page-status ${p.status >= 400 || p.status === 0 ? "page-status-bad" : ""}`}>
                        {p.status || "ERR"}
                      </span>
                      <span className="page-path">{p.path || "/"}</span>
                      <span className="mono-label page-depth">depth {p.depth}</span>
                      <span className="mono-label page-size">{formatBytes(p.size)}</span>
                      <span className="page-title">{p.title}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="glass-panel summary-panel">
                <div className="mono-label sidebar-heading">Network / Resource Summary</div>
                <div className="summary-grid">
                  <SummaryRow label="HTML" value={report.stats.html} />
                  <SummaryRow label="CSS" value={report.stats.css} />
                  <SummaryRow label="JS" value={report.stats.javascript} />
                  <SummaryRow label="JSON" value={report.stats.json} />
                  <SummaryRow label="Images" value={report.stats.images} />
                  <SummaryRow label="Fonts" value={report.stats.fonts} />
                  <SummaryRow label="XML" value={report.stats.xml} />
                  <SummaryRow label="Other" value={report.stats.other} />
                </div>
              </section>

              <button
                className="btn btn-primary export-btn"
                onClick={handleExportZip}
                disabled={exporting}
              >
                {exporting ? "PACKAGING…" : "DOWNLOAD ZIP ↓"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedResource && selectedResource.type === "IMAGE" && (
        <ImageViewer resource={selectedResource} onClose={() => setSelectedResource(null)} />
      )}
      {selectedResource && selectedResource.type !== "IMAGE" && (
        <SourceViewer resource={selectedResource} onClose={() => setSelectedResource(null)} />
      )}

      <style>{`
        .dash-shell {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 20px 60px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .dash-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 22px;
        }
        .dash-title {
          font-size: 22px;
          letter-spacing: 0.12em;
        }
        .target-panel {
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .target-row {
          display: flex;
          gap: 10px;
        }
        .target-submit {
          white-space: nowrap;
        }
        .options-toggle {
          align-self: flex-start;
          margin-top: 4px;
        }
        .options-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 14px;
          margin-top: 8px;
          padding-top: 14px;
          border-top: 1px solid var(--border);
        }
        .option-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
        }
        .option-toggle {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }
        .scanning-panel,
        .error-panel,
        .empty-panel {
          padding: 20px 22px;
        }
        .error-panel {
          border-color: var(--border-strong);
        }
        .notice-panel {
          padding: 14px 18px;
          font-size: 13px;
          color: var(--text-dim);
        }
        .error-list {
          margin: 8px 0 0;
          padding-left: 18px;
          font-size: 12px;
          color: var(--text-dim);
          max-height: 160px;
          overflow: auto;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
          gap: 12px;
        }
        .dash-grid {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 16px;
          margin-top: 16px;
        }
        @media (max-width: 860px) {
          .dash-grid {
            grid-template-columns: 1fr;
          }
        }
        .resource-sidebar {
          padding: 16px;
          height: fit-content;
          max-height: 720px;
          display: flex;
          flex-direction: column;
        }
        .sidebar-heading {
          margin-bottom: 10px;
        }
        .filter-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-bottom: 12px;
        }
        .filter-chip {
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 4px 8px;
          border-radius: 3px;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--text-dim);
          cursor: pointer;
        }
        .filter-chip-active {
          border-color: var(--border-strong);
          color: var(--red-soft);
          box-shadow: 0 0 8px rgba(255, 48, 48, 0.3);
        }
        .resource-list {
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .resource-item {
          text-align: left;
          background: transparent;
          border: 1px solid transparent;
          border-radius: 4px;
          padding: 8px 8px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
          color: var(--text-primary);
        }
        .resource-item:hover {
          background: rgba(255, 48, 48, 0.08);
          border-color: var(--border);
        }
        .resource-type-tag {
          font-size: 10px;
          color: var(--red-soft);
        }
        .resource-url {
          font-size: 12px;
          word-break: break-all;
        }
        .resource-meta {
          font-size: 10px;
        }
        .empty-note {
          padding: 10px 0;
        }
        .dash-main {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .metadata-panel,
        .pages-panel,
        .summary-panel {
          padding: 16px 18px;
        }
        .meta-row {
          display: flex;
          gap: 10px;
          font-size: 12.5px;
          padding: 6px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .meta-row-label {
          width: 130px;
          flex-shrink: 0;
          color: var(--text-dim);
        }
        .pages-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          max-height: 320px;
          overflow-y: auto;
        }
        .page-row {
          display: grid;
          grid-template-columns: 46px 1fr 70px 70px 1fr;
          gap: 10px;
          align-items: center;
          font-size: 12px;
          padding: 6px 4px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
        }
        .page-status {
          color: var(--red-soft);
          font-weight: 600;
        }
        .page-status-bad {
          color: #ff9d9d;
        }
        .page-path {
          word-break: break-all;
        }
        .page-title {
          color: var(--text-dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
          gap: 10px;
        }
        .export-btn {
          align-self: flex-start;
        }
      `}</style>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="glass-panel stat-card">
      <div className="mono-label">{label}</div>
      <div className="stat-value neon-text">{value}</div>
      <style>{`
        .stat-card {
          padding: 14px 16px;
        }
        .stat-value {
          font-size: 22px;
          margin-top: 4px;
        }
      `}</style>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="meta-row">
      <span className="meta-row-label mono-label">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass-panel summary-row">
      <span className="mono-label">{label}</span>
      <span className="neon-text">{value}</span>
      <style>{`
        .summary-row {
          padding: 8px 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

function ImageViewer({
  resource,
  onClose,
}: {
  resource: InspectedResource;
  onClose: () => void;
}) {
  return (
    <div className="img-overlay fade-in" role="dialog" aria-modal="true">
      <div className="glass-panel glow-border img-panel">
        <div className="img-header">
          <span className="mono-label">[IMAGE] {resource.contentType}</span>
          <button className="btn btn-ghost" onClick={onClose}>
            CLOSE ✕
          </button>
        </div>
        <div className="img-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={resource.url} alt={resource.url} className="img-preview" />
        </div>
        <div className="img-footer">
          <MetaRow label="URL" value={resource.url} />
          <MetaRow label="Content Type" value={resource.contentType} />
          <MetaRow label="Size" value={formatBytes(resource.size)} />
          <MetaRow label="Status" value={String(resource.status)} />
          <a
            className="btn export-btn"
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            OPEN RESOURCE ↗
          </a>
        </div>
      </div>
      <style>{`
        .img-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }
        .img-panel {
          width: 100%;
          max-width: 720px;
          max-height: 88vh;
          overflow-y: auto;
        }
        .img-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
        }
        .img-body {
          padding: 16px;
          display: flex;
          justify-content: center;
          background: repeating-conic-gradient(#0d0d0d 0% 25%, #0a0a0a 0% 50%) 50% / 20px 20px;
        }
        .img-preview {
          max-width: 100%;
          max-height: 50vh;
          object-fit: contain;
          border: 1px solid var(--border);
        }
        .img-footer {
          padding: 12px 16px 18px;
        }
      `}</style>
    </div>
  );
}
