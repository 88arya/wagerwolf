"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, apiError } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { useTimeZoneSync } from "@/lib/useTimeZoneSync";
import HelmetAvatar from "@/components/HelmetAvatar";
import DocsShell from "@/components/DocsShell";
import type { Me } from "@/lib/types";

type FieldKey = "displayName" | "name" | "abbreviation" | "helmet";

type Tab = "personal" | "security" | "league";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "personal", label: "Personal information" },
  { key: "security", label: "Login & security" },
  { key: "league",   label: "Default league profile" },
];

const NAME_ALLOWED = /[^A-Za-z0-9 ]/g;
const NAME_MIN = 3;

function cleanDisplayName(v: string) {
  return v
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(NAME_ALLOWED, "")
    .replace(/\s{2,}/g, " ");
}
function displayNameOk(v: string) {
  return v.trim().length >= NAME_MIN;
}

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

function SaveButton({
  field, disabled, onClick, savedField, savingField,
}: {
  field: FieldKey;
  disabled: boolean;
  onClick: () => void;
  savedField: FieldKey | null;
  savingField: FieldKey | null;
}) {
  if (savedField === field && disabled) {
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

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("personal");

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [abbrev, setAbbrev] = useState("");
  const [helmet, setHelmet] = useState<string | null>(null);

  const [editing, setEditing] = useState<FieldKey | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [error, setError] = useState("");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.replace("/"); return; }
    api("/users/me")
      .then((u: Me) => {
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

  useTimeZoneSync(user?.timeZone);

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
      if (updated.displayName) localStorage.setItem("displayName", updated.displayName);
      setSavedField(field);
      setEditing(null);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedField(null), 2400);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSavingField(null);
    }
  }

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
  const shownHelmet = editing === "helmet" ? helmet : (user?.defaultHelmetColor ?? null);
  const seededAbbrev = abbrevFromName(user?.displayName ?? "");

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");

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
                        savedField={savedField}
                        savingField={savingField}
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
                        savedField={savedField}
                        savingField={savingField}
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
                        savedField={savedField}
                        savingField={savingField}
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
                      <span className="mx-row-value" style={{ marginTop: 0 }}>Random</span>
                    )}
                  </div>
                  {editing === "helmet" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxWidth: 420, marginTop: 12 }}>
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
                        savedField={savedField}
                        savingField={savingField}
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
