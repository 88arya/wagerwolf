import GamesStrip from "@/components/GamesStrip";
import LeagueNav from "@/components/LeagueNav";
import LobbyGate from "@/components/LobbyGate";
import TopBar from "@/components/TopBar";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  return (
    <>
      <TopBar />
      <GamesStrip leagueId={leagueId} />
      <LeagueNav leagueId={leagueId} />
      <LobbyGate leagueId={leagueId}>{children}</LobbyGate>
    </>
  );
}
