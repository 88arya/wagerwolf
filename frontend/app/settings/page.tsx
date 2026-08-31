"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useTimeZoneSync } from "@/lib/useTimeZoneSync";
import HelmetAvatar from "@/components/HelmetAvatar";
import DocsShell from "@/components/DocsShell";

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
 * - Personal information — you, and only you. Real name, birthday, time zone.
 *   None of it is ever shown to another player. Email is deliberately absent:
 *   it is not editable here (Google owns it) and it already sits opposite
 *   "Google" under Login & security, which is the row that explains what it is
 *   FOR. Printing it twice made the personal tab look like a form.
 * - Login & security — how you get in, and how you stop.
 * - Default league profile — what other players see. Display name, and the
 *   defaults a new membership is seeded from.
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

// One icon each, drawn on the same 24-unit grid at the same stroke so they read
// as a set: a person for who you are, a shield for how you get in, a globe for
// how you appear to other people.
const ICONS: Record<Tab, string> = {
  personal: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
  security: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  league:   "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
};

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "personal", label: "Personal information" },
  { key: "security", label: "Login & security" },
  { key: "league",   label: "Default league profile" },
];

// A display name is the one thing other players see, so it has to read as a
// name: three characters minimum, letters/digits/spaces only. Illegal keystrokes
// are DROPPED as you type rather than rejected on save — a field that refuses
// the character teaches the rule immediately, where an error under a filled-in
// form makes you go back and find which character it meant.
const NAME_ALLOWED = /[^A-Za-z0-9 ]/g;
const NAME_MIN = 3;

function cleanDisplayName(v: string) {
  // Accents fold onto their ASCII base BEFORE the filter runs, so José becomes
  // Jose rather than Jos. Stripping first would eat the letter along with the
  // mark. Mirrors backend/src/services/displayName.ts, which is the authority.
  return v
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(NAME_ALLOWED, "")
    .replace(/\s{2,}/g, " ");
}
function displayNameOk(v: string) {
  return v.trim().length >= NAME_MIN;
}

// The abbreviation a new membership is seeded from when you have not set one:
// the first three letters of the display name. Shown on the row rather than
// left as "generated for each league", so the field states the value that will
// actually be used, and prefilled into the editor so picking the default is a
// Save rather than a retype.
//
// Always exactly ABBREV_LEN, padding a short one by repeating its first letter
// — "a b" is a legal display name and yields only AB. Mirrors
// backend/src/services/abbreviation.ts, which is the authority; the two must
// agree or the value this page promises is not the one the league gets.
const ABBREV_LEN = 3;

function abbrevFromName(name: string) {
  let tag = name.replace(/[^A-Za-z]/g, "").slice(0, ABBREV_LEN).toUpperCase();
  if (!tag) return "";
  while (tag.length < ABBREV_LEN) tag += tag[0];
  return tag;
}

// Shared by every swatch so None cannot drift out of size with the colours.
const SWATCH: React.CSSProperties = {
  width: 22, height: 22, padding: 0, borderRadius: 0,
  boxShadow: "none", transform: "none", cursor: "pointer", flexShrink: 0,
  outlineOffset: 2,
};

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
  // null is a real value here, not "unset": it means "pick one for me in each
  // league", which is what the None swatch selects.
  const [helmet, setHelmet] = useState<string | null>(null);

  // Which field's editor is open, if any. Read-first: a row shows what the
  // value IS and one link to change it, and the input appears only once you ask
  // for it. Only one at a time — two open editors on a summary page turn it
  // back into the form this was trying to stop being.
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [error, setError] = useState("");
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

  // The rail's rows. Buttons rather than links, because these tabs are local
  // state and deliberately never touch the URL — DocsShell draws either kind
  // identically, so the rail does not betray which it is.
  const railItems = TABS.map(({ key, label }) => ({
    key,
    name: label,
    active: tab === key,
    onSelect: () => setTab(key),
  }));

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
      setEditing(null);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedField(null), 2400);
    } catch (err: any) {
      try { setError(JSON.parse(err.message).error); } catch { setError(err.message); }
    } finally {
      setSavingField(null);
    }
  }

  // The shell is rendered in both states, so the rail and the top bar are
  // there from the first frame and only the pane fills in. It used to be a bare
  // header over a centred block, which moved the whole page when /users/me
  // landed.
  if (loading) {
    return (
      <DocsShell title="Account" items={railItems}>
        <div className="mx-empty">Loading your account…</div>
      </DocsShell>
    );
  }

  const nameChanged = firstName !== (user?.firstName ?? "") || lastName !== (user?.lastName ?? "");
  const abbrevChanged = abbrev.toUpperCase() !== (user?.defaultAbbreviation ?? "");
  const seasons: number = user?.yearsExperience ?? 0;
  const palette: string[] = user?.helmetPalette ?? [];
  // The draft while the palette is open, the stored value otherwise — so the
  // helmet previews the pick you have not committed yet.
  const shownHelmet = editing === "helmet" ? helmet : (user?.defaultHelmetColor ?? null);
  const seededAbbrev = abbrevFromName(user?.displayName ?? "");

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  // Reseeds the inputs from the stored user before opening, so cancelling an
  // edit and reopening it never resurrects a half-typed value from last time.
  function openEdit(field: FieldKey) {
    setError("");
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setDisplayName(user?.displayName ?? "");
    setAbbrev(user?.defaultAbbreviation || abbrevFromName(user?.displayName ?? ""));
    setHelmet(user?.defaultHelmetColor ?? null);
    setEditing(field);
  }

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
    <DocsShell title="Account" items={railItems}>
          {error && <div className="mx-notice is-bad" style={{ marginBottom: 16 }}>{error}</div>}

          {tab === "personal" && (
            <section className="mx-section" style={{ marginTop: 0 }}>
              <h2 className="mx-pane-title">Personal information</h2>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Full name</div>
                  {editing === "name" ? (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <input className="mx-field" value={firstName} maxLength={40} placeholder="First" onChange={(e) => setFirstName(e.target.value)} style={{ maxWidth: 150 }} />
                      <input className="mx-field" value={lastName} maxLength={40} placeholder="Last" onChange={(e) => setLastName(e.target.value)} style={{ maxWidth: 150 }} />
                    </div>
                  ) : (
                    <div className={fullName ? "mx-row-value" : "mx-row-value is-empty"}>{fullName || "Not set"}</div>
                  )}
                </div>
                <div className="mx-row-side">
                  {editing === "name" ? (
                    <>
                      <button type="button" className="mx-row-action is-plain" onClick={() => setEditing(null)}>Cancel</button>
                      <SaveButton
                        field="name"
                        disabled={!firstName.trim() || !lastName.trim() || !nameChanged}
                        onClick={() => save("name", { firstName: firstName.trim(), lastName: lastName.trim() })}
                      />
                    </>
                  ) : (
                    <button type="button" className="mx-row-action" onClick={() => openEdit("name")}>
                      {fullName ? "Edit" : "Add"}
                    </button>
                  )}
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Time zone</div>
                  <div className="mx-row-value">{user?.timeZone ?? "Not set"}</div>
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Account created</div>
                  <div className="mx-row-value">{memberSince}</div>
                </div>
              </div>
            </section>
          )}

          {tab === "security" && (
            <section className="mx-section" style={{ marginTop: 0 }}>
              <h2 className="mx-pane-title">Login &amp; security</h2>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Google</div>
                  <div className="mx-row-value">{user?.email ?? "Not set"}</div>
                </div>
                <div className="mx-row-side">
                  <span className="mx-row-state">{user?.hasGoogle ? "Connected" : "Not connected"}</span>
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Sign out</div>
                </div>
                <div className="mx-row-side">
                  <button type="button" className="mx-row-action" onClick={() => { signOut(); router.push("/"); }}>
                    Sign out
                  </button>
                </div>
              </div>

            </section>
          )}

          {tab === "league" && (
            <section className="mx-section" style={{ marginTop: 0 }}>
              <h2 className="mx-pane-title">Default league profile</h2>

              {/* What a new membership is seeded from. A league keeps its own
                  copy of all three — that is the point of the per-league
                  identity — so changing anything here affects the NEXT league
                  you join, not the ones you are already in. */}
              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Display name</div>
                  {editing === "displayName" ? (
                    <div style={{ marginTop: 8 }}>
                      <input
                        className="mx-field"
                        value={displayName}
                        maxLength={32}
                        onChange={(e) => setDisplayName(cleanDisplayName(e.target.value))}
                        style={{ maxWidth: 260 }}
                      />
                      {/* Shown only while the value is actually illegal. The
                          input silently refuses the characters it will not
                          take, so length is the only rule you can still break
                          — and an error that is always on screen is a caption,
                          not an error. */}
                      {!displayNameOk(displayName) && (
                        <span className="mx-field-error">
                          Display name must be at least {NAME_MIN} characters.
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={user?.displayName ? "mx-row-value" : "mx-row-value is-empty"}>
                      {user?.displayName || "Not set"}
                    </div>
                  )}
                </div>
                <div className="mx-row-side">
                  {editing === "displayName" ? (
                    <>
                      <button type="button" className="mx-row-action is-plain" onClick={() => setEditing(null)}>Cancel</button>
                      <SaveButton
                        field="displayName"
                        disabled={!displayNameOk(displayName) || displayName.trim() === user?.displayName}
                        onClick={() => save("displayName", { displayName: displayName.trim() })}
                      />
                    </>
                  ) : (
                    <button type="button" className="mx-row-action" onClick={() => openEdit("displayName")}>Edit</button>
                  )}
                </div>
              </div>

              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Abbreviation</div>
                  {editing === "abbreviation" ? (
                    <div style={{ marginTop: 8 }}>
                      <input
                        className="mx-field"
                        value={abbrev}
                        maxLength={ABBREV_LEN}
                        placeholder={seededAbbrev || "Auto"}
                        onChange={(e) => setAbbrev(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ABBREV_LEN))}
                        style={{ maxWidth: 96, letterSpacing: "0.22em", textTransform: "uppercase" }}
                      />
                      {/* Empty is not an error — it clears the tag back to
                          "follow my display name". Only a half-typed one is. */}
                      {abbrev.length > 0 && abbrev.length !== ABBREV_LEN && (
                        <span className="mx-field-error">
                          Abbreviation must be exactly {ABBREV_LEN} letters.
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className={user?.defaultAbbreviation ? "mx-row-value" : "mx-row-value is-empty"}>
                      {user?.defaultAbbreviation || seededAbbrev || "Generated for each league"}
                      {!user?.defaultAbbreviation && seededAbbrev ? " — from your display name" : ""}
                    </div>
                  )}
                </div>
                <div className="mx-row-side">
                  {editing === "abbreviation" ? (
                    <>
                      <button type="button" className="mx-row-action is-plain" onClick={() => setEditing(null)}>Cancel</button>
                      <SaveButton
                        field="abbreviation"
                        disabled={!abbrevChanged || (abbrev.length > 0 && abbrev.length !== ABBREV_LEN)}
                        onClick={() => save("abbreviation", { defaultAbbreviation: abbrev || null })}
                      />
                    </>
                  ) : (
                    <button type="button" className="mx-row-action" onClick={() => openEdit("abbreviation")}>
                      {user?.defaultAbbreviation ? "Edit" : "Add"}
                    </button>
                  )}
                </div>
              </div>

              {/* Edit -> pick -> Cancel or Save, the same shape as every other
                  row here. The swatches used to commit on click, with Clear and
                  Done in the side slot instead of Cancel and Save — one row
                  behaving differently from the three above it, and two verbs
                  that appear nowhere else on the page.

                  Clicking a swatch now only sets the draft; the helmet beside
                  the label previews it, so the selection is still visible
                  before you commit it. Clearing survives as the first swatch
                  rather than as its own button. */}
              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Display color</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    {shownHelmet ? (
                      <HelmetAvatar
                        color={shownHelmet}
                        initials={(user?.defaultAbbreviation || user?.displayName || "?").slice(0, 2)}
                        size={30}
                      />
                    ) : (
                      /* Not .is-empty: Random is something you can choose from
                         the palette, so it is a value the row is stating, not a
                         field you have left blank. */
                      <span className="mx-row-value" style={{ marginTop: 0 }}>Random</span>
                    )}
                  </div>
                  {editing === "helmet" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 420, marginTop: 12 }}>
                      {/* "None" is a swatch rather than a Clear button, so the
                          palette holds every choice including the absence of
                          one, and the side slot stays Cancel/Save. */}
                      <button
                        type="button"
                        aria-label="Random color"
                        aria-pressed={helmet === null}
                        disabled={savingField === "helmet"}
                        onClick={() => setHelmet(null)}
                        style={{
                          ...SWATCH,
                          background: "var(--surface)",
                          border: "1px solid var(--border-2)",
                          outline: helmet === null ? "2px solid var(--accent)" : "2px solid transparent",
                          // A corner-to-corner hairline: the "no colour" mark
                          // every colour picker uses, drawn rather than spelled
                          // out so it sits in the grid as one more 22px square.
                          backgroundImage:
                            "linear-gradient(to top right, transparent calc(50% - 0.5px), var(--border-3) calc(50% - 0.5px), var(--border-3) calc(50% + 0.5px), transparent calc(50% + 0.5px))",
                        }}
                      />
                      {palette.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={c}
                          aria-pressed={helmet === c}
                          disabled={savingField === "helmet"}
                          onClick={() => setHelmet(c)}
                          style={{
                            ...SWATCH,
                            background: c,
                            border: "none",
                            outline: helmet === c ? "2px solid var(--accent)" : "2px solid transparent",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="mx-row-side">
                  {editing === "helmet" ? (
                    <>
                      <button type="button" className="mx-row-action is-plain" onClick={() => setEditing(null)}>Cancel</button>
                      <SaveButton
                        field="helmet"
                        disabled={helmet === (user?.defaultHelmetColor ?? null)}
                        onClick={() => save("helmet", { defaultHelmetColor: helmet })}
                      />
                    </>
                  ) : (
                    <button type="button" className="mx-row-action" onClick={() => openEdit("helmet")}>
                      {user?.defaultHelmetColor ? "Edit" : "Add"}
                    </button>
                  )}
                </div>
              </div>

              {/* No control, on purpose. This was briefly a number you typed,
                  which made the one figure leagues could sort on a free-text
                  field anyone could put "20" into. */}
              <div className="mx-row">
                <div className="mx-row-main">
                  <div className="mx-row-label">Experience</div>
                  <div className="mx-row-value">{seasons} {seasons === 1 ? "year" : "years"}</div>
                </div>
              </div>
            </section>
          )}
    </DocsShell>
  );
}
