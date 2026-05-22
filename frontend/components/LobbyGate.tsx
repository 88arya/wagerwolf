"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LobbyGate({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const startedRef = useRef(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) { setVisible(true); return; }

    function evaluate(started: boolean) {
      if (started) { setVisible(true); return; }
      const base = `/leagues/${leagueId}`;
      const allowed = [`${base}/members`, `${base}/settings`];
      const ok = allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
      if (ok) {
        setVisible(true);
      } else {
        setVisible(false);
        router.replace(`${base}/members`);
      }
    }

    if (startedRef.current) {
      evaluate(true);
      return;
    }

    api(`/leagues/${leagueId}`)
      .then((league: any) => {
        if (league.seasonStarted) startedRef.current = true;
        evaluate(!!league.seasonStarted);
      })
      .catch(() => setVisible(true));
  }, [leagueId, pathname]);

  if (!visible) return null;
  return <>{children}</>;
}
