import Link from "next/link";

import { ActionLinkCard } from "@/app/ui/action-link-card";
import { PageContainer, SectionHeader, SurfacePanel } from "@/app/ui/foundation";

export default function Home() {
  const leaderboardPreview = [
    { rank: 1, team: "Midnight Protocol", matches: 12, wins: 10, points: 30 },
    { rank: 2, team: "Abyss Wardens", matches: 12, wins: 9, points: 27 },
    { rank: 3, team: "Crimson Echo", matches: 12, wins: 8, points: 24 },
    { rank: 4, team: "Neon Vanguard", matches: 12, wins: 7, points: 21 },
    { rank: 5, team: "Iron Pulse", matches: 12, wins: 6, points: 18 },
  ];

  return (
    <PageContainer width="wide" className="flex flex-1 flex-col py-10 lg:py-14">
      <main className="space-y-10 lg:space-y-12">
        <SectionHeader
          eyebrow="PUB OF HOMIES LEAGUE"
          title="Compete. Climb. Dominate."
          titleClassName="type-headline-xl max-w-5xl"
          className="max-w-4xl"
          description="Weekly Scrims • Seasonal Qualifiers • Grand Finals"
        />

        <section className="surface-base surface-glass relative overflow-hidden p-6 lg:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 via-transparent to-red-900/25" />
          <div className="relative flex flex-wrap gap-3">
            <Link href="/register" className="btn-base btn-primary px-4 py-2">
              Register Now
            </Link>
            <Link href="/dashboard/leaderboard" className="btn-base btn-secondary px-4 py-2">
              View Leaderboard
            </Link>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="type-title">Event Formats</h2>
          <div className="grid gap-4 lg:grid-cols-3">
            <SurfacePanel variant="glass" className="p-5">
              <p className="type-subtitle text-soft">Weekly Scrims</p>
              <p className="mt-2 text-sm text-muted">Single Elimination</p>
            </SurfacePanel>
            <SurfacePanel variant="glass" className="p-5">
              <p className="type-subtitle text-soft">Qualifiers</p>
              <p className="mt-2 text-sm text-muted">Double Elimination</p>
            </SurfacePanel>
            <SurfacePanel variant="glass" className="p-5">
              <p className="type-subtitle text-soft">Grand Finals</p>
              <p className="mt-2 text-sm text-muted">Season points format</p>
            </SurfacePanel>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="type-title">Leaderboard Preview</h2>
            <Link href="/dashboard/leaderboard" className="btn-base btn-ghost px-3 py-1.5 text-xs">
              View Full Leaderboard
            </Link>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[38rem] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Team Name</th>
                  <th className="px-3 py-2">Matches</th>
                  <th className="px-3 py-2">Wins</th>
                  <th className="px-3 py-2">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardPreview.map((row) => (
                  <tr key={row.rank} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td className="px-3 py-2">{row.rank}</td>
                    <td className="px-3 py-2">{row.team}</td>
                    <td className="px-3 py-2">{row.matches}</td>
                    <td className="px-3 py-2">{row.wins}</td>
                    <td className="px-3 py-2">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4">
          <SurfacePanel variant="elevated" className="p-5">
            <h2 className="type-title">Join the League</h2>
            <p className="mt-2 text-sm text-muted">
              Register as a team or solo player. Solo players can be assigned into teams
              from the admin dashboard.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ActionLinkCard
                href="/register/team"
                title="Register Team"
                description="Submit team roster and captain details."
                meta="Public path"
              />
              <ActionLinkCard
                href="/register/solo"
                title="Register Solo Player"
                description="Join the solo pool for team assignment."
                meta="Public path"
              />
            </div>
          </SurfacePanel>
        </section>

        <section className="space-y-3">
          <h2 className="type-title">Map Pool</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["Ascent", "Bind", "Haven", "Split", "Lotus", "Sunset", "Icebox"].map((map) => (
              <SurfacePanel key={map} variant="glass" className="p-4">
                <p className="type-subtitle text-soft">{map}</p>
                <p className="mt-1 text-xs text-muted">Available in BO3 Map Veto</p>
              </SurfacePanel>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="type-title">Rewards</h2>
          <div className="grid gap-3 lg:grid-cols-3">
            <SurfacePanel variant="elevated" className="p-4">
              <p className="type-subtitle text-soft">MVP of the Tournament</p>
              <p className="mt-1 text-sm text-muted">Top impact performer across stages.</p>
            </SurfacePanel>
            <SurfacePanel variant="elevated" className="p-4">
              <p className="type-subtitle text-soft">Most Entertaining Player</p>
              <p className="mt-1 text-sm text-muted">Community-voted highlight machine.</p>
            </SurfacePanel>
            <SurfacePanel variant="elevated" className="p-4">
              <p className="type-subtitle text-soft">Discount Rewards</p>
              <p className="mt-1 text-sm text-muted">15%, 20%, and 25% seasonal partner rewards.</p>
            </SurfacePanel>
          </div>
        </section>

        <SurfacePanel variant="glass" className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-sm text-muted">Discord • Rules • Contact • Socials</p>
          <Link href="/riot.txt" className="btn-base btn-ghost px-3 py-1.5 text-xs">
            Riot Verification File
          </Link>
        </SurfacePanel>
      </main>
    </PageContainer>
  );
}
