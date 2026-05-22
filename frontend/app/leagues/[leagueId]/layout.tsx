import LeagueNav from "@/components/LeagueNav";
import LobbyGate from "@/components/LobbyGate";

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
      <LeagueNav leagueId={leagueId} />
      <LobbyGate leagueId={leagueId}>{children}</LobbyGate>
    </>
  );
}
