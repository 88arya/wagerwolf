import LeagueNav from "@/components/LeagueNav";
import LobbyGate from "@/components/LobbyGate";

// TopBar and GamesStrip used to be rendered here. They are global now — the
// root layout mounts both via components/AppChrome, which reads the league id
// straight off the route — so this layout only adds the league's own nav.
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
