export type RegistrationType = "team" | "solo";
export type RegistrationStatus = "pending" | "approved" | "rejected";
export type EventStatus =
  | "draft"
  | "registration_open"
  | "registration_closed"
  | "in_progress"
  | "completed"
  | "archived";
export type MatchStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "forfeit"
  | "cancelled";

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
  registrationToken?: string;
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
  registrationToken?: string;
  email?: string;
  currentRank?: PlayerRank;
  peakRank?: PlayerRank;
};

export type SoloPlayerStatus = "available" | "assigned";

export type SoloPlayerPoolRecord = {
  id: string;
  name: string;
  riotId: string;
  discordId: string;
  preferredRole: PlayerRole;
  eventId: string;
  status: SoloPlayerStatus;
  email?: string;
  currentRank?: PlayerRank;
  peakRank?: PlayerRank;
};

export type UnderfilledTeamRecord = {
  id: string;
  teamName: string;
  captainDiscordId: string;
  eventId: string;
  playerCount: number;
  slotsRemaining: number;
  inviteCode?: string;
};

export type TeamRosterPlayerRecord = {
  id: string;
  name: string;
  riotId: string;
  discordId: string;
  role: PlayerRole;
  eventId: string;
  teamId: string;
  registrationId?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ApprovedTeamRosterRecord = {
  id: string;
  teamName: string;
  captainDiscordId: string;
  eventId: string;
  playerCount: number;
  status?: string;
  registrationId?: string;
  email?: string;
  teamLogoUrl?: string;
  teamTag?: string;
  inviteCode?: string;
  createdAt: string | null;
  updatedAt: string | null;
  players: TeamRosterPlayerRecord[];
};

export type RandomTeamCreationSummary = {
  operationId: string;
  eventId: string;
  teamSize: number;
  selectedCount: number;
  createdTeamCount: number;
  createdTeamIds: string[];
};

export type SoloPlayerAssignmentSummary = {
  eventId: string;
  teamId: string;
  assignedCount: number;
  resultingPlayerCount: number;
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

export type EventRegistrationLinkMeta = Record<
  string,
  string | number | boolean | null
>;

export type EventRecord = {
  id: string;
  tenantId?: string;
  organizerId?: string;
  game?: string;
  region?: string;
  format?: TournamentFormat;
  visibility?: "public" | "unlisted" | "private";
  entryFeeMinor?: number;
  currency?: string;
  registrationMode?: RegistrationApprovalMode;
  prizePoolConfigJson?: string;
  createdByUserId?: string;
  name: string;
  slug: string;
  code: string;
  status: EventStatus;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationClosesAt: string;
  registrationLinkToken?: string;
  registrationLinkMeta?: EventRegistrationLinkMeta;
  createdAt: string | null;
  updatedAt: string | null;
};

export type MatchRecord = {
  id: string;
  eventId: string;
  homeTeamId: string;
  awayTeamId: string;
  mapRef: string;
  playedAt: string;
  status: MatchStatus;
  homeScore: number;
  awayScore: number;
  homeRoundDiff: number;
  awayRoundDiff: number;
};

export type TeamStandingAggregate = {
  eventId: string;
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  matchesPlayed: number;
  roundDiff: number;
  points?: number;
};

export type PlayerStatAggregate = {
  eventId: string;
  playerId: string;
  teamId: string;
  matchId?: string;
  mapRef?: string;
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  mapsPlayed: number;
};

export type PlayerStatRecord = PlayerStatAggregate & {
  id: string;
};

export type MvpCandidate = {
  eventId: string;
  playerId: string;
  teamId: string;
  kills: number;
  deaths: number;
  assists: number;
  matchesPlayed: number;
  roundDiff: number;
  points?: number;
  score: number;
  rank: number;
};

export type MvpSummary = {
  eventId: string;
  generatedAt: string;
  topCandidate?: MvpCandidate;
  candidates: MvpCandidate[];
};

export type MapRecord = {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PlatformRole = "player" | "organizer" | "admin";

export type PlatformUserStatus = "active" | "suspended" | "deleted";

export type OrganizerVerificationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected";

export type OrganizerEventStatus =
  | "draft"
  | "published"
  | "ongoing"
  | "completed"
  | "archived";

export type TournamentFormat =
  | "single_elimination"
  | "double_elimination"
  | "league";

export type RegistrationApprovalMode = "manual_approval" | "auto_approval";

export type PaymentStatus =
  | "initiated"
  | "authorized"
  | "captured"
  | "failed"
  | "refunded"
  | "settled";

export type EscrowTransactionType =
  | "entry_fee_charge"
  | "escrow_credit"
  | "escrow_debit"
  | "commission_reserve"
  | "refund"
  | "adjustment";

export type PayoutStatus =
  | "requested"
  | "under_review"
  | "approved"
  | "rejected"
  | "processing"
  | "paid"
  | "failed";

export type TenantScopedRecord = {
  tenantId: string;
  organizerId: string;
};

export type PlatformUserRecord = {
  id: string;
  appwriteUserId: string;
  displayName: string;
  email: string;
  phone?: string;
  roles: PlatformRole[];
  status: PlatformUserStatus;
  defaultRegion?: string;
  kycStatus: "not_required" | "pending" | "verified" | "rejected";
  createdAt: string | null;
  updatedAt: string | null;
};

export type OrganizerRecord = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  name: string;
  slug: string;
  supportEmail: string;
  verificationStatus: OrganizerVerificationStatus;
  verificationBadge: boolean;
  commissionRateBps: number;
  payoutHoldDays: number;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BracketRecord = TenantScopedRecord & {
  id: string;
  eventId: string;
  format: TournamentFormat;
  version: number;
  state: "draft" | "published" | "locked" | "completed";
  structureJson: string;
  generatedByUserId: string;
  publishedAt?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type EscrowTransactionRecord = TenantScopedRecord & {
  id: string;
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  payeeType: "escrow" | "organizer" | "platform" | "user_refund";
  transactionType: EscrowTransactionType;
  gateway: "razorpay" | "internal";
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  gatewaySignature?: string;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  riskFlagsJson?: string;
  metadataJson?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PayoutRecord = TenantScopedRecord & {
  id: string;
  eventId?: string;
  requestedAmountMinor: number;
  approvedAmountMinor?: number;
  currency: string;
  status: PayoutStatus;
  requestedByUserId: string;
  reviewedByUserId?: string;
  sourceTransactionRefsJson?: string;
  payoutReference?: string;
  failureReason?: string;
  requestedAt: string;
  processedAt?: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type CreateRegistrationPaymentOrderPayload = {
  eventId: string;
  registrationId?: string;
  payerUserId?: string;
  receipt?: string;
};

export type VerifyRazorpayPaymentPayload = {
  eventId?: string;
  registrationId?: string;
  payerUserId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type RazorpayWebhookPaymentEntity = {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  status?: string;
  notes?: Record<string, string>;
};
