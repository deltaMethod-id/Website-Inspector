"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function WipasGate() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!password) return;
    setStatus("verifying");
    setErrorMessage("");

    try {
      const res = await fetch("/api/wipas/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus("error");
        setErrorMessage(data.message || "WIPAS verification failed.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setStatus("error");
      setErrorMessage("Network error while contacting WIPAS.");
    }
  }

  return (
    <main className="wipas-shell">
      <div className="wipas-card glass-panel glow-border fade-in">
        <div className="wipas-badge scan-indicator">WI</div>

        <div className="mono-label" style={{ textAlign: "center", marginTop: 18 }}>
          WIPAS // ACCESS CONTROL
        </div>
        <h1 className="wipas-title neon-text">WEBSITE INSPECTOR</h1>

        <div className="wipas-divider" />

        <p className="wipas-desc">
          <strong className="neon-text">WIPAS</strong>
          <br />
          Website Inspector Password
          <br />
          Authentication System
        </p>

        <form onSubmit={handleSubmit} className="wipas-form">
          <label className="mono-label" htmlFor="wipas-password">
            WIPAS Password
          </label>
          <input
            id="wipas-password"
            type="password"
            className="input-field"
            placeholder="ENTER PASSWORD"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoFocus
          />

          {status === "error" && <div className="wipas-error">{errorMessage}</div>}

          <button
            type="submit"
            className="btn btn-primary wipas-submit"
            disabled={status === "verifying" || !password}
          >
            {status === "verifying" ? "VERIFYING…" : "UNLOCK WITH WIPAS →"}
          </button>
        </form>

        <div className="wipas-footer mono-label">
          <span className="status-dot" /> WIPAS • HTTPONLY SESSION • 8H TTL
        </div>
      </div>

      <style>{`
        .wipas-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .wipas-card {
          width: 100%;
          max-width: 420px;
          padding: 36px 32px 28px;
          text-align: center;
        }
        .wipas-badge {
          width: 56px;
          height: 56px;
          margin: 0 auto;
          border: 1px solid var(--border-strong);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 20px;
          color: var(--red-soft);
          box-shadow: 0 0 18px rgba(255, 48, 48, 0.35);
        }
        .wipas-title {
          margin: 10px 0 0;
          font-size: 22px;
          letter-spacing: 0.14em;
        }
        .wipas-divider {
          height: 1px;
          margin: 22px 0;
          background: linear-gradient(90deg, transparent, var(--border-strong), transparent);
        }
        .wipas-desc {
          font-size: 13px;
          line-height: 1.7;
          color: var(--text-dim);
          margin-bottom: 24px;
        }
        .wipas-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          text-align: left;
        }
        .wipas-submit {
          margin-top: 14px;
          width: 100%;
        }
        .wipas-error {
          color: var(--red-soft);
          font-size: 12px;
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 8px 10px;
          background: rgba(255, 48, 48, 0.08);
        }
        .wipas-footer {
          margin-top: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
      `}</style>
    </main>
  );
}
