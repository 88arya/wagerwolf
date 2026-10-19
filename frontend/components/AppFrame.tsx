"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import AppChrome from "@/components/AppChrome";
import MobileGate from "@/components/MobileGate";
import SideNav from "@/components/SideNav";
import LoadingBar from "@/components/LoadingBar";
import { armBoot, useBooted } from "@/lib/bootGate";

// Signed-in routes get the sidebar + card shell; everything else the classic layout.
const SHELL_ROUTES = ["/home", "/leagues"];

function inShell(pathname: string) {
  return SHELL_ROUTES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

// Rendered last so its effect runs after every other component's mount fetches.
function ShellBoot() {
  useEffect(() => { armBoot(); }, []);
  return null;
}

export default function AppFrame({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const booted = useBooted();

  if (inShell(pathname)) {
    return (
      <>
      {/* Desktop only: CSS shows either the shell or the mobile gate. */}
      <MobileGate />
      {/* Hidden (not unmounted) until the first data lands, then revealed at once. */}
      {!booted && (
        <LoadingBar label="Loading" className="shell-boot" />
      )}
      <div className={booted ? "app-shell" : "app-shell is-booting"}>
        <SideNav />
        <div className="app-card">{children}</div>
      </div>
      <ShellBoot />
      </>
    );
  }

  return (
    <div className="app-scroll">
      <AppChrome />
      {children}
      {footer}
    </div>
  );
}
