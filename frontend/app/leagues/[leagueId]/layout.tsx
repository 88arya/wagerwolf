import LeagueNav from "@/components/LeagueNav";

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
      {children}
    </>
  );
}
