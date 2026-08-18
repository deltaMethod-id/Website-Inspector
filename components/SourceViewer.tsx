"use client";

import { useMemo, useState } from "react";
import type { InspectedResource } from "@/lib/types";

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Lightweight, dependency-free token highlighter. Good enough for a fast
 *  read-only viewer without pulling in a full highlighting library. */
function highlight(content: string, type: InspectedResource["type"]): string {
  const escaped = escapeHtml(content);

  if (type === "JSON") {
    return escaped.replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(\.\d+)?([eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          return /:$/.test(match)
            ? `<span class="tok-attr">${match}</span>`
            : `<span class="tok-string">${match}</span>`;
        }
        if (/true|false|null/.test(match)) return `<span class="tok-keyword">${match}</span>`;
        return `<span class="tok-number">${match}</span>`;
      }
    );
  }

  if (type === "HTML" || type === "XML") {
    return escaped
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-comment">$1</span>')
      .replace(/(&lt;\/?)([a-zA-Z0-9:-]+)/g, '$1<span class="tok-tag">$2</span>')
      .replace(/([a-zA-Z-]+)(=)(".*?"|'.*?')/g, '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>');
  }

  if (type === "CSS") {
    return escaped
      .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-comment">$1</span>')
      .replace(/([.#]?[a-zA-Z0-9_-]+)(\s*\{)/g, '<span class="tok-tag">$1</span>$2')
      .replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="tok-attr">$1</span>$2')
      .replace(/(:\s*)([^;{}]+)(;)/g, '$1<span class="tok-string">$2</span>$3');
  }

  if (type === "JS") {
    const keywords =
      /\b(const|let|var|function|return|if|else|for|while|import|export|default|from|class|extends|new|async|await|try|catch|typeof|instanceof|switch|case|break|continue|this|null|undefined|true|false)\b/g;
    return escaped
      .replace(/(\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>')
      .replace(/(&#39;.*?&#39;|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)/g, '<span class="tok-string">$1</span>')
      .replace(keywords, '<span class="tok-keyword">$1</span>')
      .replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
  }

  return escaped;
}

export default function SourceViewer({
  resource,
  onClose,
}: {
  resource: InspectedResource;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  const lines = useMemo(() => (resource.content ?? "").split("\n"), [resource.content]);

  const highlightedLines = useMemo(
    () => lines.map((line) => highlight(line, resource.type)),
    [lines, resource.type]
  );

  const matchCount = useMemo(() => {
    if (!query) return 0;
    const lower = (resource.content ?? "").toLowerCase();
    const q = query.toLowerCase();
    let count = 0;
    let idx = lower.indexOf(q);
    while (idx !== -1) {
      count += 1;
      idx = lower.indexOf(q, idx + q.length);
    }
    return count;
  }, [query, resource.content]);

  async function handleCopy() {
    if (!resource.content) return;
    try {
      await navigator.clipboard.writeText(resource.content);
    } catch {
      // clipboard may be unavailable — silently ignore
    }
  }

  function handleDownload() {
    if (!resource.content) return;
    const blob = new Blob([resource.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = resource.url.split("/").filter(Boolean).pop() || "resource.txt";
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="viewer-overlay fade-in" role="dialog" aria-modal="true">
      <div className="viewer-panel glass-panel glow-border">
        <div className="viewer-header">
          <div className="viewer-header-info">
            <span className="mono-label">
              [{resource.type}]{" "}
              {resource.isCompiledBundle && (
                <span className="viewer-bundle-tag">COMPILED CLIENT BUNDLE</span>
              )}
            </span>
            <div className="viewer-url">{resource.url}</div>
            <div className="mono-label viewer-meta">
              {resource.status} • {(resource.size / 1024).toFixed(1)} KB • {resource.contentType}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}>
            CLOSE ✕
          </button>
        </div>

        <div className="viewer-toolbar">
          <input
            className="input-field"
            placeholder="SEARCH IN SOURCE…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && <span className="mono-label viewer-match-count">{matchCount} matches</span>}
          <div className="viewer-toolbar-actions">
            <button className="btn" onClick={handleCopy}>
              COPY
            </button>
            <button className="btn" onClick={handleDownload}>
              DOWNLOAD
            </button>
          </div>
        </div>

        <div className="viewer-code">
          {resource.content === undefined ? (
            <div className="viewer-empty">
              Binary or unavailable content — use OPEN RESOURCE to view it directly.
            </div>
          ) : (
            <pre className="viewer-pre">
              {highlightedLines.map((line, i) => {
                const isMatch =
                  query && lines[i].toLowerCase().includes(query.toLowerCase());
                return (
                  <div key={i} className={`viewer-line ${isMatch ? "viewer-line-match" : ""}`}>
                    <span className="viewer-line-number">{i + 1}</span>
                    <span
                      className="viewer-line-content"
                      dangerouslySetInnerHTML={{ __html: line || "&nbsp;" }}
                    />
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      </div>

      <style>{`
        .viewer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }
        .viewer-panel {
          width: 100%;
          max-width: 980px;
          height: 82vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .viewer-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 16px 18px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
        }
        .viewer-url {
          font-size: 13px;
          color: var(--text-primary);
          word-break: break-all;
          margin-top: 4px;
        }
        .viewer-meta {
          margin-top: 4px;
        }
        .viewer-bundle-tag {
          color: var(--red-soft);
          border: 1px solid var(--border-strong);
          padding: 1px 6px;
          border-radius: 3px;
          margin-left: 6px;
        }
        .viewer-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 18px;
          border-bottom: 1px solid var(--border);
        }
        .viewer-toolbar .input-field {
          flex: 1;
        }
        .viewer-match-count {
          white-space: nowrap;
        }
        .viewer-toolbar-actions {
          display: flex;
          gap: 8px;
        }
        .viewer-code {
          flex: 1;
          overflow: auto;
          background: #070707;
        }
        .viewer-pre {
          margin: 0;
          padding: 12px 0;
          font-size: 12.5px;
          line-height: 1.6;
        }
        .viewer-line {
          display: flex;
          padding: 0 14px;
        }
        .viewer-line:hover {
          background: rgba(255, 48, 48, 0.05);
        }
        .viewer-line-match {
          background: rgba(255, 48, 48, 0.12);
        }
        .viewer-line-number {
          width: 44px;
          flex-shrink: 0;
          text-align: right;
          margin-right: 16px;
          color: var(--text-faint);
          user-select: none;
        }
        .viewer-line-content {
          white-space: pre-wrap;
          word-break: break-word;
          color: var(--text-primary);
        }
        .viewer-empty {
          padding: 30px;
          color: var(--text-dim);
        }
      `}</style>
    </div>
  );
}
