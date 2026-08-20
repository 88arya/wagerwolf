"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { LEAGUE_LEVELS } from "@/lib/geo";

/**
 * Join a public league.
 *
 * You state a size, a level and a start week and get assigned — there is no
 * list of open leagues to look through. That is how ESPN, Yahoo and Sleeper all do it, and
 * the reason is that a season-long league with the same ten people is not a
 * product you comparison-shop: leagues differ by name, size and stake, and what
 * decides whether you enjoy it is whether the league *fills and starts*.
 * Assignment sends everyone to the league closest to starting, which is what
 * makes leagues fill instead of stranding half-empty lobbies.
 *
 * This replaced a browsable directory with search, five skill tiers, and
 * country/region filters. If a list ever comes back, it needs a reason that
 * survives that argument.
 */

const SIZES = [4, 6, 8, 10, 12];

type StartWeek = { number: number; startDate: string };

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
    </svg>
  );
}

export default function QuickJoin({
  open,
  onClose,
  onJoined,
}: {
  open: boolean;
  onClose: () => void;
  /** Receives the membership plus whether the size preference had to give. */
  onJoined: (membership: any) => void;
}) {
  const [size, setSize] = useState<number | null>(null);
  const [level, setLevel] = useState("BEGINNER");
  const [startWeek, setStartWeek] = useState<number | null>(null);
  const [weeks, setWeeks] = useState<StartWeek[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");

  // Start weeks come from the server, not a 1..17 range: a week that has
  // already resolved is not a start week, and the set shrinks as the season
  // runs. Refetched on every open so a sheet left closed over a Tuesday
  // resolve does not offer a week that has since been played.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingOptions(true);
    setError("");
    api("/memberships/join-options")
      .then((d: any) => {
        if (cancelled) return;
        setWeeks(d.startWeeks ?? []);
        setStartWeek(d.defaultStartWeek ?? null);
      })
      .catch(() => { if (!cancelled) setError("Couldn't load the available start weeks."); })
      .finally(() => { if (!cancelled) setLoadingOptions(false); });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape" && !joining) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, joining]);

  async function submit() {
    setJoining(true);
    setError("");
    try {
      const membership = await api("/memberships/quick-join", {
        method: "POST",
        body: JSON.stringify({ maxPlayers: size, level, startWeek }),
      });
      onJoined(membership);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError("Couldn't find you a league."); }
      setJoining(false);
    }
  }

  if (!open) return null;

  return (
    <div className="mx-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget && !joining) onClose(); }}>
      <div className="mx-sheet" role="dialog" aria-modal="true" aria-label="Join a league">

        <div className="mx-sheet-head">
          <div>
            <span className="mx-sheet-title">Join a league</span>
            <div style={{ fontSize: "0.76rem", color: "var(--text-3)", marginTop: 4 }}>
              We&rsquo;ll put you in the league closest to filling.
            </div>
          </div>
          <button type="button" className="mx-sheet-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="mx-stack">
          <div>
            <span className="mx-label">Season starts</span>
            {loadingOptions ? (
              <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>Loading weeks…</div>
            ) : weeks.length === 0 ? (
              <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                No upcoming weeks are open right now.
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {weeks.map(w => (
                  <button
                    key={w.number}
                    type="button"
                    className={`mx-chip${startWeek === w.number ? " is-on" : ""}`}
                    onClick={() => setStartWeek(w.number)}
                  >
                    Week {w.number}
                    <span style={{ opacity: 0.72, marginLeft: 2 }}>
                      {new Date(w.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 8 }}>
              The NFL week your league starts betting. We&rsquo;ll never put you in a league that
              starts on a different week.
            </div>
          </div>

          <div>
            <span className="mx-label">League size</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" className={`mx-chip${size === null ? " is-on" : ""}`} onClick={() => setSize(null)}>Any</button>
              {SIZES.map(n => (
                <button key={n} type="button" className={`mx-chip${size === n ? " is-on" : ""}`} onClick={() => setSize(n)}>
                  {n} teams
                </button>
              ))}
            </div>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginTop: 8 }}>
              {size
                ? "If no league that size is open, we'll widen this and tell you."
                : "We'll pick whatever is closest to starting."}
            </div>
          </div>

          <div>
            <span className="mx-label">Experience level</span>
            {/* Two cards rather than chips: this is the one choice that is never
                compromised on, so it gets the weight and the explanation. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {LEAGUE_LEVELS.map(l => {
                const on = level === l.value;
                return (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => setLevel(l.value)}
                    aria-pressed={on}
                    style={{
                      textAlign: "left",
                      // Two overrides needed to make this card wrap. The global
                      // `button` rule sets `white-space: nowrap`, correct for a
                      // pill and wrong for a card with a sentence in it; and
                      // grid items default to `min-width: auto`, which lets the
                      // content push the card past its 1fr track and out of the
                      // sheet. Without both, the second card runs off the edge.
                      whiteSpace: "normal",
                      minWidth: 0,
                      padding: "12px 13px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-2)"}`,
                      background: on ? "var(--accent-dim)" : "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      boxShadow: "none",
                      transform: "none",
                      transition: "border-color 0.12s, background 0.12s",
                    }}
                  >
                    <span style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: on ? "var(--accent)" : "var(--text)" }}>
                      {l.label}
                    </span>
                    <span style={{ display: "block", fontSize: "0.72rem", color: "var(--text-3)", marginTop: 3, lineHeight: 1.35 }}>
                      {l.blurb}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {error && <div className="mx-notice is-bad">{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 2 }}>
            <button type="button" className="mx-btn is-quiet" onClick={onClose} disabled={joining}>Cancel</button>
            <button type="button" className="mx-btn is-primary" onClick={submit} disabled={joining || loadingOptions || !startWeek} style={{ padding: "9px 18px" }}>
              <BoltIcon /> {joining ? "Finding a league…" : "Find me a league"}
            </button>
          </div>

          <div style={{ fontSize: "0.72rem", color: "var(--text-3)", lineHeight: 1.45 }}>
            If nothing matches, we&rsquo;ll start a league with you as commissioner &mdash; same
            level and start week &mdash; and hand you an invite code.
          </div>
        </div>
      </div>
    </div>
  );
}
