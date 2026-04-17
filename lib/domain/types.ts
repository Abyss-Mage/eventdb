export type RegistrationType = "team" | "solo";
export type RegistrationStatus = "pending" | "approved" | "rejected";

export type PlayerRole =
  | "duelist"
  | "initiator"
  | "controller"
  | "sentinel"
  | "flex";

export type PlayerRank =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "ascendant"
  | "immortal"
  | "radiant";

export type TeamPlayerInput = {
  name: string;
  riotId: string;
  discordId: string;
  role: PlayerRole;
};

export type TeamRegistrationInput = {
  teamName: string;
  captainDiscordId: string;
  players: TeamPlayerInput[];
  eventId: string;
  email?: string;
  teamLogoUrl?: string;
  teamTag?: string;
};

export type SoloRegistrationInput = {
  name: string;
  riotId: string;
  discordId: string;
  preferredRole: PlayerRole;
  eventId: string;
  email?: string;
  currentRank?: PlayerRank;
  peakRank?: PlayerRank;
};

type RegistrationBase = {
  id: string;
  status: RegistrationStatus;
  submittedAt: string | null;
  updatedAt: string | null;
  rejectionReason?: string;
};

export type TeamRegistrationRecord = RegistrationBase & {
  type: "team";
  teamName: string;
  captainDiscordId: string;
  eventId: string;
  email?: string;
  teamLogoUrl?: string;
  teamTag?: string;
  players: TeamPlayerInput[];
};

export type SoloRegistrationRecord = RegistrationBase & {
  type: "solo";
  player: SoloRegistrationInput;
};

export type RegistrationRecord = TeamRegistrationRecord;
