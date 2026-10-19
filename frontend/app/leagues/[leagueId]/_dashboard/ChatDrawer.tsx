"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";

const SLIDE = "0.25s cubic-bezier(0.4,0,0.2,1)";
const POLL_MS = 5000;

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-3)" }}>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function Message({ msg, isOwn }: { msg: ChatMessage; isOwn: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
      <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "var(--text-3)", marginBottom: 3 }}>
        {isOwn ? "You" : msg.user?.displayName}
        <span style={{ fontWeight: 400, marginLeft: 5 }}>
          {new Date(msg.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </span>
      </div>
      <div style={{
        fontSize: "0.8rem", lineHeight: 1.45,
        color: isOwn ? "#fff" : "var(--text)",
        background: isOwn ? "var(--accent)" : "var(--surface-2)",
        borderRadius: isOwn ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
        padding: "7px 11px", maxWidth: "82%", wordBreak: "break-word",
      }}>
        {msg.body}
      </div>
    </div>
  );
}

// Slide-out league chat. Polls for new messages while open.
export default function ChatDrawer({ leagueId, userId }: { leagueId: string; userId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (!leagueId) return;
    try {
      setMessages((await api(`/leagues/${leagueId}/messages`)) ?? []);
    } catch {}
  }

  async function send() {
    const body = input.trim();
    if (!body || !leagueId) return;
    setInput("");
    try {
      const msg = await api(`/leagues/${leagueId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {}
  }

  useEffect(() => {
    if (!open || !leagueId) return;
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [open, leagueId]);

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "auto" }), 60);
  }, [open]);

  const canSend = !!input.trim();

  return (
    <>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? 320 : 0, top: "50%", transform: "translateY(-50%)",
          transition: `right ${SLIDE}`,
          background: "var(--surface)", border: "1px solid var(--border)", borderRight: "none",
          borderRadius: "8px 0 0 8px", padding: "10px 7px", cursor: "pointer", zIndex: 36,
          display: "flex", flexDirection: "column", alignItems: "center",
          boxShadow: "-2px 0 10px rgba(0,0,0,0.08)", userSelect: "none",
        }}
      >
        <ChatIcon />
      </div>

      <div className="chat-drawer" style={{
        position: "fixed", right: 0, top: 0, bottom: 60, width: "var(--chat-w, 320px)",
        transform: open ? "translateX(0)" : "translateX(var(--chat-w, 320px))",
        transition: `transform ${SLIDE}`,
        background: "var(--surface)", borderLeft: "1px solid var(--border)",
        display: "flex", flexDirection: "column", zIndex: 35,
        boxShadow: open ? "-4px 0 24px rgba(0,0,0,0.08)" : "none",
      }}>
        <div style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: "0.85rem", color: "var(--text)" }}>League Chat</span>
          <button className="tap-target" aria-label="Close chat" onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-3)", padding: "2px 4px", fontSize: "1rem", lineHeight: 1, borderRadius: 4 }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No messages yet</span>
            </div>
          )}
          {messages.map((msg) => <Message key={msg.id} msg={msg} isOwn={msg.user?.id === userId} />)}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: "10px 12px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexShrink: 0 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Message…"
            maxLength={500}
            style={{ flex: 1, fontSize: "0.82rem", padding: "8px 10px", border: "1px solid var(--border-2)", borderRadius: 6, outline: "none", color: "var(--text)" }}
          />
          <button
            onClick={send}
            disabled={!canSend}
            style={{
              background: "var(--accent)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 12px",
              fontSize: "0.8rem", fontWeight: 700, cursor: canSend ? "pointer" : "default",
              opacity: canSend ? 1 : 0.45, transition: "opacity 0.12s",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </>
  );
}
