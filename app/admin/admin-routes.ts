export const ADMIN_ROUTES = {
  entry: "/admin",
  login: "/admin/login",
  twoFactor: "/admin/2fa",
} as const;

export const DASHBOARD_ROUTES = {
  overview: "/dashboard",
  registrations: "/dashboard/registrations",
  events: "/dashboard/events",
  teams: "/dashboard/teams",
  matches: "/dashboard/matches",
  leaderboard: "/dashboard/leaderboard",
  playerStats: "/dashboard/player-stats",
  mvp: "/dashboard/mvp",
  riotSync: "/dashboard/riot-sync",
  teamBuilder: "/dashboard/team-builder",
  pastEvents: "/dashboard/past-events",
  settings: "/dashboard/settings",
} as const;

export const DASHBOARD_NAV_ITEMS = [
  { href: DASHBOARD_ROUTES.overview, label: "Overview" },
  { href: DASHBOARD_ROUTES.registrations, label: "Registrations" },
  { href: DASHBOARD_ROUTES.events, label: "Events" },
  { href: DASHBOARD_ROUTES.teams, label: "Registered Teams" },
  { href: DASHBOARD_ROUTES.matches, label: "Matches" },
  { href: DASHBOARD_ROUTES.leaderboard, label: "Leaderboard" },
  { href: DASHBOARD_ROUTES.playerStats, label: "Player Stats" },
  { href: DASHBOARD_ROUTES.mvp, label: "MVP" },
  { href: DASHBOARD_ROUTES.riotSync, label: "Riot Sync" },
  { href: DASHBOARD_ROUTES.teamBuilder, label: "Team Builder" },
  { href: DASHBOARD_ROUTES.pastEvents, label: "Past Events" },
  { href: DASHBOARD_ROUTES.settings, label: "Settings" },
] as const;
