"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { seasonLabel } from "@/lib/geo";
import { useTimeZoneSync } from "@/lib/useTimeZoneSync";
import HelmetAvatar from "@/components/HelmetAvatar";

/**
 * My Account — the identity that follows you across every league.
 *
 * Built in the chrome's vocabulary (hairline rows, weight 400–500, one accent);
 * see the "Modern surface" block in globals.css. No nav of its own — AppChrome
 * already mounts the utility bar on this route.
 *
 * THREE TABS, in a left rail, and the split is not arbitrary — it is by who the
 * data is for:
 *
 * - Personal information — you, and only you. Real name, email, birthday, time
 *   zone. None of it is ever shown to another player.
 * - Login & security — how you get in, and how you stop.
 * - League profile — what other players see. Display name, and the defaults a
 *   new membership is seeded from.
 *
 * Tabs are local state, not routes. The URL carrying UI state is what broke the
 * league profile editor (see components/LeagueProfileModal) — App Router does
 * not remount a page for a query-string-only change, so an effect reading the
 * parameter never re-runs and the panel silently fails to open on the page you
 * are already on.
 *
 * Three values are shown WITHOUT a control, because each is derived and an
 * input would offer to save something that gets recomputed anyway:
 * seasons played (from the join date), time zone (from the device), and date of
 * birth (write-once at onboarding — see backend/src/services/age.ts).
 */

// Saved per field, not per form. One Save button at the bottom makes you
// re-confirm four untouched fields to change one, and gives no signal about
// which of them actually landed.
type FieldKey = "displayName" | "name" | "abbreviation" | "helmet";

type Tab = "personal" | "security" | "league";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "personal", label: "Personal information" },
  { key: "security", label: "Login & security" },
  { key: "league",   label: "League profile" },
];

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("personal");

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [abbrev, setAbbrev] = useState("");

  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [error, setError] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  // One timer, cleared on every new save, so a second save does not inherit the
  // first's countdown and blink the tick away early.
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/"); return; }
    api("/users/me")
      .then((u: any) => {
        setUser(u);
        setDisplayName(u.displayName ?? "");
        setFirstName(u.firstName ?? "");
        setLastName(u.lastName ?? "");
        setAbbrev(u.defaultAbbreviation ?? "");
      })
      .catch(() => setError("Couldn't load your account."))
      .finally(() => setLoading(false));
  }, [router]);

  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  // Must sit above the `if (loading)` return below. It was under it at first,
  // which meant the hook was skipped on the first render and ran on the second
  // — React counts hooks by call order, so that shifts every later hook by one
  // and it warns about exactly this. A no-op until `user` loads, which is fine:
  // it compares against the stored value and only PATCHes on a difference.
  useTimeZoneSync(user?.timeZone);

  async function save(field: FieldKey, body: Record<string, unknown>) {
    setError("");
    setSavingField(field);
    try {
      const updated = await api("/users/me", { method: "PATCH", body: JSON.stringify(body) });
      setUser(updated);
      // The display name is mirrored into localStorage because several league
      // views fall back to it before /users/me has answered.
      if (updated.displayName) localStorage.setItem("displayName", updated.displayName);
      setSavedField(field);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedField(null), 2400);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSavingField(null);
    }
  }

  async function deactivate() {
    setError("");
    setDeactivating(true);
    try {
      await api("/users/me/deactivate", { method: "POST", body: JSON.stringify({}) });
      signOut();
      router.push("/");
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
      setDeactivating(false);
    }
  }

  if (loading) {
    return <div className="page-wide"><div className="mx-empty">Loading your account…</div></div>;
  }

  const nameChanged = firstName !== (user?.firstName ?? "") || lastName !== (user?.lastName ?? "");
  const abbrevChanged = abbrev.toUpperCase() !== (user?.defaultAbbreviation ?? "");
  const seasons: number = user?.yearsExperience ?? 0;
  // Named, not dated. The September 1 boundary in services/experience.ts is an
  // approximation of a kickoff that moves by up to a week each year, so quoting
  // a month promises a precision this does not have — and it was rendering a
  // day early anyway for anyone west of Greenwich.
  const nextSeason = user?.nextSeasonYear != null ? seasonLabel(user.nextSeasonYear) : null;
  const palette: string[] = user?.helmetPalette ?? [];

  const fmtDay = (v: string | null | undefined) =>
    v ? new Date(`${String(v).slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
    }) : "—";

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
    : "—";

  function SaveButton({ field, disabled, onClick }: { field: FieldKey; disabled: boolean; onClick: () => void }) {
    if (savedField === field && disabled) {
      // Sits in the button's place rather than replacing the row, so nothing
      // reflows between "Save" and the confirmation.
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: "var(--win)", padding: "8px 4px" }}>
          <CheckIcon /> Saved
        </span>
      );
    }
    return (
      <button type="button" className="mx-btn is-quiet" disabled={disabled || savingField === field} onClick={onClick}>
        {savingField === field ? "Saving…" : "Save"}
      </button>
    );
  }

  return (
    <div className="page-wide">
      {/* Rail then content. `align-items: start` so the rail does not stretch to
          the height of the tallest tab and hang a rule into empty space. */}
      <div
        style={{
          maxWidth: 940, margin: "0 auto", width: "100%",
          display: "grid", gridTemplateColumns: "200px minmax(0, 1fr)",
          gap: 40, alignItems: "start",
        }}
      >
        {/* ── Rail ─────────────────────────────────────────────────── */}
        <nav style={{ position: "sticky", top: 0 }} aria-label="Account sections">
          <h1 className="mx-title" style={{ margin: "0 0 16px" }}>My Account</h1>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {TABS.map(({ key, label }) => {
              const on = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setTab(key); setConfirmOff(false); }}
                  aria-current={on ? "page" : undefined}
                  style={{
                    // Not .mx-btn: these are navigation, not actions. A left
                    // accent rule marks the active one, the same device the
                    // league nav uses for its underline.
                    textAlign: "left", padding: "9px 0 9px 12px",
                    borderLeft: `2px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    borderTop: "none", borderRight: "none", borderBottom: "none",
                    borderRadius: 0, background: "transparent", boxShadow: "none", transform: "none",
                    color: on ? "var(--text)" : "var(--text-2)",
                    fontSize: "0.82rem", fontWeight: on ? 500 : 400,
                    whiteSpace: "nowrap", cursor: "pointer",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* ── Content ──────────────────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          {error && <div className="mx-notice is-bad" style={{ marginBottom: 16 }}>{error}</div>}

          {tab === "personal" && (
            <section className="mx-section">
              <div className="mx-section-title">Personal information</div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Full name
                  <span className="mx-row-hint">Private. Never shown to other players.</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input className="mx-field" value={firstName} maxLength={40} placeholder="First" onChange={(e) => setFirstName(e.target.value)} style={{ maxWidth: 150 }} />
                  <input className="mx-field" value={lastName} maxLength={40} placeholder="Last" onChange={(e) => setLastName(e.target.value)} style={{ maxWidth: 150 }} />
                  <SaveButton
                    field="name"
                    disabled={!firstName.trim() || !lastName.trim() || !nameChanged}
                    onClick={() => save("name", { firstName: firstName.trim(), lastName: lastName.trim() })}
                  />
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Email
                  <span className="mx-row-hint">From your Google account.</span>
                </div>
                <div className="mx-row-value">{user?.email ?? "—"}</div>
              </div>

              {/* Write-once at onboarding: it is the field the age gate rests
                  on, and leaving it editable would let someone walk it back the
                  day after clearing the gate. Backend refuses a second write. */}
              <div className="mx-row">
                <div className="mx-row-label">
                  Date of birth
                  <span className="mx-row-hint">Set once when you signed up. Contact support if it&rsquo;s wrong.</span>
                </div>
                <div className="mx-row-value">{fmtDay(user?.dateOfBirth)}</div>
              </div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Time zone
                  <span className="mx-row-hint">
                    Taken from your device, so kickoff times show in your local time. Updates on its own if you move.
                  </span>
                </div>
                <div className="mx-row-value">{user?.timeZone ?? "—"}</div>
              </div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Member since
                  <span className="mx-row-hint">The day this account was created.</span>
                </div>
                <div className="mx-row-value">{memberSince}</div>
              </div>
            </section>
          )}

          {tab === "security" && (
            <section className="mx-section">
              <div className="mx-section-title">Login &amp; security</div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Google
                  <span className="mx-row-hint">
                    The only way into this account. There is no password to set or lose.
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="mx-tag">{user?.hasGoogle ? "Connected" : "Not connected"}</span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>{user?.email}</span>
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Sign out
                  <span className="mx-row-hint">Ends this session on this device.</span>
                </div>
                <div>
                  <button type="button" className="mx-btn is-quiet" onClick={() => { signOut(); router.push("/"); }}>
                    Sign out
                  </button>
                </div>
              </div>

              {/* Two-step, and the second step spells out the irreversible part
                  rather than asking "are you sure?" — the seats go back, and a
                  league that refilled is not waiting when you return. */}
              <div className="mx-row">
                <div className="mx-row-label">
                  Deactivate account
                  <span className="mx-row-hint">
                    Leaves every league and hides your account. Signing in with Google brings it
                    back — but your leagues will have moved on without you.
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                  {!confirmOff ? (
                    <button type="button" className="mx-btn is-danger" onClick={() => setConfirmOff(true)}>
                      Deactivate
                    </button>
                  ) : (
                    <>
                      <div className="mx-notice is-warn" style={{ margin: 0 }}>
                        You&rsquo;ll leave every league you&rsquo;re in and your seats will be given up. Your
                        bets and results stay on record for the leagues you played in. Signing back in
                        reactivates the account, but you&rsquo;ll have to join leagues again.
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="mx-btn is-quiet" onClick={() => setConfirmOff(false)} disabled={deactivating}>
                          Cancel
                        </button>
                        <button type="button" className="mx-btn is-danger" onClick={deactivate} disabled={deactivating}>
                          {deactivating ? "Deactivating…" : "Yes, deactivate"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </section>
          )}

          {tab === "league" && (
            <section className="mx-section">
              <div className="mx-section-title">League profile</div>

              {/* What a new membership is seeded from. A league keeps its own
                  copy of all three — that is the point of the per-league
                  identity — so changing anything here affects the NEXT league
                  you join, not the ones you are already in. */}
              <div className="mx-row">
                <div className="mx-row-label">
                  Display name
                  <span className="mx-row-hint">
                    The name new leagues start you with. Rename yourself inside any league without
                    touching this.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="mx-field"
                    value={displayName}
                    maxLength={32}
                    onChange={(e) => setDisplayName(e.target.value)}
                    style={{ maxWidth: 260 }}
                  />
                  <SaveButton
                    field="displayName"
                    disabled={!displayName.trim() || displayName === user?.displayName}
                    onClick={() => save("displayName", { displayName: displayName.trim() })}
                  />
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-label">
                  Abbreviation
                  <span className="mx-row-hint">
                    Two or three letters. Left empty, each league generates one from your display name.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="mx-field"
                    value={abbrev}
                    maxLength={3}
                    placeholder="Auto"
                    onChange={(e) => setAbbrev(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
                    style={{ maxWidth: 96, letterSpacing: "0.22em", textTransform: "uppercase" }}
                  />
                  <SaveButton
                    field="abbreviation"
                    disabled={!abbrevChanged || (abbrev.length > 0 && abbrev.length < 2)}
                    onClick={() => save("abbreviation", { defaultAbbreviation: abbrev || null })}
                  />
                </div>
              </div>

              {/* Saved on click rather than behind a Save button: a swatch grid
                  where the selection does nothing until you press something
                  else reads as broken. */}
              <div className="mx-row">
                <div className="mx-row-label">
                  Helmet colour
                  <span className="mx-row-hint">
                    Colours stay unique inside a league, so if someone got there first you&rsquo;ll be
                    given another one.
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <HelmetAvatar
                      color={user?.defaultHelmetColor ?? "var(--border-2)"}
                      initials={(user?.defaultAbbreviation || user?.displayName || "?").slice(0, 2)}
                      size={34}
                    />
                    <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                      {user?.defaultHelmetColor ? user.defaultHelmetColor : "No default — a colour is picked for you"}
                    </span>
                    {user?.defaultHelmetColor && (
                      <button type="button" className="mx-btn is-bare" onClick={() => save("helmet", { defaultHelmetColor: null })}>
                        Clear
                      </button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 420 }}>
                    {palette.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        aria-pressed={user?.defaultHelmetColor === c}
                        disabled={savingField === "helmet"}
                        onClick={() => save("helmet", { defaultHelmetColor: c })}
                        style={{
                          width: 22, height: 22, padding: 0, borderRadius: "var(--radius-sm)", background: c,
                          border: "none", boxShadow: "none", transform: "none", cursor: "pointer", flexShrink: 0,
                          outline: user?.defaultHelmetColor === c ? "2px solid var(--accent)" : "2px solid transparent",
                          outlineOffset: 2,
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* No control, on purpose. This was briefly a number you typed,
                  which made the one figure leagues could sort on a free-text
                  field anyone could put "20" into. */}
              <div className="mx-row">
                <div className="mx-row-label">
                  Seasons played
                  <span className="mx-row-hint">
                    Counted from the day you joined, not self-reported. It goes up on its own with
                    each new NFL season.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "1.4rem", fontWeight: 400, letterSpacing: "-0.028em", color: "var(--text)", lineHeight: 1 }}>
                    {seasons}
                  </span>
                  {nextSeason && (
                    <span style={{ fontSize: "0.74rem", color: "var(--text-3)" }}>
                      {seasons === 0
                        ? `You start with the ${nextSeason} season`
                        : `Your next season is ${nextSeason}`}
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
