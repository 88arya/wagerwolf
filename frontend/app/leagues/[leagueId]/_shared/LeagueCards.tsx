"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import HelmetAvatar from "@/components/HelmetAvatar";
import { ACCENT } from "@/lib/constants";
import type { PendingMember } from "@/lib/types";

export const outlineButton = (tone: "win" | "loss"): CSSProperties => ({
  borderRadius: "var(--radius-sm)", fontWeight: 700, background: "none",
  border: `1px solid var(--${tone}-border)`, color: `var(--${tone})`, cursor: "pointer", boxShadow: "none",
});

export const smallButton = (tone: "win" | "loss"): CSSProperties => ({ ...outlineButton(tone), padding: "4px 10px", fontSize: "0.72rem" });

export function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text)" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

export function InviteCodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card title="Invite Code">
      <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span className="invite-code" style={{ fontSize: "1.5rem" }}>{code}</span>
        <button type="button" onClick={copy}
          style={{ padding: "5px 12px", borderRadius: "var(--radius-sm)", fontSize: "0.78rem", fontWeight: 700, background: "none", border: "1px solid var(--border-2)", cursor: "pointer", color: "var(--text-2)", boxShadow: "none" }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--text-3)"; e.currentTarget.style.color = "var(--text)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-2)"; }}>
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </Card>
  );
}

// Pending join requests, for the commissioner to accept or reject.
export function JoinRequestsCard({ requests, onAccept, onReject }: {
  requests: PendingMember[];
  onAccept: (userId: string) => void;
  onReject: (userId: string) => void;
}) {
  return (
    <Card title={`Join Requests (${requests.length})`}>
      {requests.map((m, idx) => {
        const name = m.user?.displayName ?? m.displayName ?? "";
        return (
          <div key={m.userId} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: idx < requests.length - 1 ? "1px solid var(--border)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <HelmetAvatar color={m.helmetColor ?? ACCENT} initials={name.slice(0, 2).toUpperCase()} size={26} />
              <span style={{ fontWeight: 500, fontSize: "0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button type="button" onClick={() => onAccept(m.userId)} style={smallButton("win")}>Accept</button>
              <button type="button" onClick={() => onReject(m.userId)} style={smallButton("loss")}>Reject</button>
            </div>
          </div>
        );
      })}
    </Card>
  );
}
