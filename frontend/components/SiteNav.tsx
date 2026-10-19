"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AccountMenu from "@/components/AccountMenu";
import LogoWordmark from "@/components/LogoWordmark";
import { useAuthed } from "@/lib/auth";
import { useDevicePixelRatio, snapToDevicePx } from "@/lib/hairline";

const NAV_H = 62;

const LOCKUP_H = 27;

const NAV_Z = 200;

const ACCOUNT_TYPE: CSSProperties = {
  fontFamily: "var(--font-sans), system-ui, sans-serif",
  fontWeight: 600,
  fontSize: "0.85rem",
  letterSpacing: "normal",
  textTransform: "none",
  lineHeight: "normal",
  whiteSpace: "nowrap",
  color: "var(--text)",
};

export default function SiteNav() {
  const router = useRouter();
  const authed = useAuthed();
  // See the bottom rule below - a plain 1px border is not crisp here.
  const dpr = useDevicePixelRatio();

  return (
    <div
      style={{
        flexShrink: 0,
        height: NAV_H,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--rail)",
        boxSizing: "border-box",
        background: "var(--glass-bg)",
        backdropFilter: "var(--glass-filter)",
        WebkitBackdropFilter: "var(--glass-filter)",
        position: "relative",
        zIndex: NAV_Z,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: snapToDevicePx(1, dpr),
          background: "var(--surface-2)",
        }}
      />

      <Link
        href={authed === true ? "/home" : "/"}
        aria-label="Wagerwolf home"
        style={{ display: "inline-flex", alignItems: "center", color: "var(--text)", flexShrink: 0 }}
      >
        <LogoWordmark height={LOCKUP_H} bare />
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        {authed === null ? null : authed ? (
          <AccountMenu style={ACCOUNT_TYPE} />
        ) : (
          <>
            <button
              type="button"
              className="mx-btn landing-cta landing-cta-outline"
              onClick={() => router.push("/sign-in")}
              style={{ fontSize: "0.85rem", fontWeight: 600, padding: "7px 18px" }}
            >
              Sign in
            </button>

            <button
              type="button"
              className="mx-btn is-primary landing-cta"
              onClick={() => router.push("/signup")}
              style={{ fontSize: "0.85rem", fontWeight: 600, padding: "7px 18px" }}
            >
              Get started
            </button>
          </>
        )}
      </div>
    </div>
  );
}
