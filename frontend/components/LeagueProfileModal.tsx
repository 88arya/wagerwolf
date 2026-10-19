"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import HelmetAvatar, { HELMET_COLORS } from "@/components/HelmetAvatar";
import type { Standing } from "@/lib/types";

const NAME_MIN = 3;
const NAME_MAX = 20;

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function LeagueProfileModal({
  leagueId,
  open,
  onClose,
}: {
  leagueId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [abbr, setAbbr] = useState("");
  const [color, setColor] = useState(HELMET_COLORS[0]);
  const [original, setOriginal] = useState({ name: "", abbr: "", color: "" });
  const [taken, setTaken] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !leagueId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const uid = localStorage.getItem("userId") ?? "";
        const board = await api<Standing[]>(`/leagues/${leagueId}/leaderboard`);
        if (cancelled) return;
        const me = board.find((m) => m.userId === uid);
        const startName = me?.displayName ?? "";
        const startAbbr = me?.abbreviation ?? "";
        const startColor = me?.helmetColor ?? HELMET_COLORS[0];
        setName(startName);
        setAbbr(startAbbr);
        setColor(startColor);
        setOriginal({ name: startName, abbr: startAbbr, color: startColor });
        setTaken(new Set(board.filter((m) => m.userId !== uid).map((m) => m.helmetColor)));
      } catch {
        if (!cancelled) setError("Couldn't load your league profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, leagueId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      setError(`Team name must be ${NAME_MIN}–${NAME_MAX} characters.`);
      return;
    }
    let tag = abbr.trim().toUpperCase();
    if (!tag) {
      tag = trimmed.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3);
      while (tag.length > 0 && tag.length < 3) tag += tag[0];
    }
    if (tag.length !== 3) {
      setError("Abbreviation must be exactly 3 letters.");
      return;
    }

    setSaving(true);
    setError("");
    const calls: Array<Promise<unknown>> = [];
    if (trimmed !== original.name) calls.push(api(`/leagues/${leagueId}/my-display-name`, { method: "PATCH", body: JSON.stringify({ displayName: trimmed }) }));
    if (tag !== original.abbr) calls.push(api(`/leagues/${leagueId}/my-abbreviation`, { method: "PATCH", body: JSON.stringify({ abbreviation: tag }) }));
    if (color !== original.color) calls.push(api(`/leagues/${leagueId}/my-helmet`, { method: "PATCH", body: JSON.stringify({ helmetColor: color }) }));

    const results = await Promise.allSettled(calls);
    setSaving(false);

    const failed = results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (failed) {
      let msg = "Couldn't save every change.";
      try { msg = JSON.parse(failed.reason?.message ?? "").error ?? msg; } catch {}
      setError(msg);
      window.dispatchEvent(new Event("league-profile-updated"));
      return;
    }

    window.dispatchEvent(new Event("league-profile-updated"));
    onClose();
  }, [name, abbr, color, original, leagueId, onClose]);

  if (!open) return null;

  const trimmed = name.trim();
  const dirty = trimmed !== original.name || abbr.trim().toUpperCase() !== original.abbr || color !== original.color;
  const nameValid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;

  return (
    <div className="mx-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="League profile">

        <div className="mx-sheet-head">
          <span className="mx-sheet-title">League profile</span>
          <button type="button" className="mx-sheet-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="mx-empty" style={{ padding: "28px 0" }}>Loading…</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 20 }}>
              <HelmetAvatar color={color} initials={(abbr || trimmed || "?").slice(0, 2)} size={42} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 500, letterSpacing: "-0.012em", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {trimmed || "Your team"}
                </div>
                <div style={{ fontSize: "0.66rem", letterSpacing: "0.14em", color: "var(--text-3)", marginTop: 3 }}>
                  {(abbr || "—").toUpperCase()}
                </div>
              </div>
            </div>

            <div className="mx-stack">
              <div>
                <label className="mx-label" htmlFor="lp-name">Team name</label>
                <input
                  id="lp-name"
                  className="mx-field"
                  autoFocus
                  value={name}
                  placeholder="Your name in this league"
                  maxLength={NAME_MAX}
                  onChange={(e) => { setError(""); setName(e.target.value.replace(/[^A-Za-z ]/g, "").replace(/ {2,}/g, " ")); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && dirty && nameValid) save(); }}
                />
              </div>

              <div>
                <label className="mx-label" htmlFor="lp-abbr">Abbreviation</label>
                <input
                  id="lp-abbr"
                  className="mx-field"
                  value={abbr}
                  placeholder="NYG"
                  maxLength={3}
                  onChange={(e) => { setError(""); setAbbr(e.target.value.toUpperCase().replace(/[^A-Z]/g, "")); }}
                  onKeyDown={(e) => { if (e.key === "Enter" && dirty && nameValid) save(); }}
                  style={{ maxWidth: 96, letterSpacing: "0.22em", textTransform: "uppercase" }}
                />
                <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 6 }}>
                  Three letters, shown on scoreboards. Left blank, it&rsquo;s taken from your team name.
                </div>
              </div>

              <div>
                <span className="mx-label">Helmet colour</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {HELMET_COLORS.map((c) => {
                    const isTaken = taken.has(c);
                    const selected = color === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-label={isTaken ? `${c} — taken` : c}
                        aria-pressed={selected}
                        disabled={isTaken}
                        onClick={() => setColor(c)}
                        style={{
                          width: 26, height: 26, padding: 0, borderRadius: "var(--radius-sm)",
                          background: c, border: "none", boxShadow: "none", transform: "none",
                          cursor: isTaken ? "not-allowed" : "pointer",
                          opacity: isTaken ? 0.22 : 1,
                          outline: selected ? "2px solid var(--accent)" : "2px solid transparent",
                          outlineOffset: 2,
                          flexShrink: 0,
                        }}
                      />
                    );
                  })}
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: 8 }}>
                  Faded colours are already taken by someone else in this league.
                </div>
              </div>

              {error && <div className="mx-notice is-bad">{error}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
                <button type="button" className="mx-btn is-quiet" onClick={onClose}>Cancel</button>
                <button type="button" className="mx-btn is-primary" disabled={!dirty || !nameValid || saving} onClick={save}>
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
