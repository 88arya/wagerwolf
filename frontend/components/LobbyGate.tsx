"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LobbyGate({ leagueId }: { leagueId: string }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    api(`/leagues/${leagueId}`)
      .then((league: any) => {
        if (league.seasonStarted) return;
        const base = `/leagues/${leagueId}`;
        const allowed = [`${base}/members`, `${base}/settings`];
        const ok = allowed.some(p => pathname === p || pathname.startsWith(p + "/"));
        if (!ok) router.replace(`${base}/members`);
      })
      .catch(() => {});
  }, [leagueId, pathname]);

  return null;
}
