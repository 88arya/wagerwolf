"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import GamesStrip from "@/components/GamesStrip";
import UserNav from "@/components/UserNav";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [weekLeagueId, setWeekLeagueId] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { router.replace("/"); return; }
    api("/memberships").then((ms: any[]) => {
      const started = ms.find((m: any) => m.league?.seasonStarted);
      if (started) setWeekLeagueId(started.leagueId);
    }).catch(() => {});
  }, []);

  return (
    <>
      <GamesStrip leagueId={weekLeagueId} interactive={false} />
      <UserNav />
      {children}
    </>
  );
}
