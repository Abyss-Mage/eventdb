import { z } from "zod";

const textSchema = z.string().trim();
const roleSchema = z.enum([
  "duelist",
  "initiator",
  "controller",
  "sentinel",
  "flex",
]);
const rankSchema = z.enum([
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "ascendant",
  "immortal",
  "radiant",
]);
const eventStatusSchema = z.enum([
  "draft",
  "registration_open",
  "registration_closed",
  "in_progress",
  "completed",
  "archived",
]);
const matchStatusSchema = z.enum([
  "scheduled",
  "in_progress",
  "completed",
  "forfeit",
  "cancelled",
]);
const isoDatetimeSchema = textSchema.refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "Must be a valid ISO-8601 datetime.",
);

const optionalEmailSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().toLowerCase().email("Email must be valid.").optional(),
);
const optionalUrlSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  z.string().trim().url("Team logo must be a valid URL.").optional(),
);
const riotIdSchema = textSchema.regex(
  /^[^#\s]+#[^#\s]+$/,
  "Riot ID must use format Name#Tag.",
);
const discordIdSchema = textSchema
  .min(2, "Discord ID must be at least 2 characters.")
  .max(80, "Discord ID cannot exceed 80 characters.");
const optionalRegistrationTokenSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  textSchema.max(120, "Registration link token cannot exceed 120 characters.").optional(),
);

const playerSchema = z.object({
  name: textSchema.min(2, "Player name must be at least 2 characters."),
  riotId: riotIdSchema,
  discordId: discordIdSchema,
  role: roleSchema,
});

export const teamRegistrationSchema = z
  .object({
    teamName: textSchema
      .min(3, "Team name must be at least 3 characters.")
      .max(40, "Team name cannot exceed 40 characters."),
    captainDiscordId: discordIdSchema,
    players: z.array(playerSchema).min(2, "A team must include at least 2 players.").max(6, "A team can include at most 6 players."),
    eventId: textSchema.min(1, "Event ID is required."),
    registrationToken: optionalRegistrationTokenSchema,
    email: optionalEmailSchema,
    teamLogoUrl: optionalUrlSchema,
    teamTag: z
      .preprocess(
        (value) =>
          typeof value === "string" && value.trim().length === 0 ? undefined : value,
        textSchema
          .max(5, "Team tag can contain at most 5 characters.")
          .optional(),
      ),
  })
  .superRefine((payload, ctx) => {
    const riotIdSet = new Set<string>();
    const discordSet = new Set<string>();

    payload.players.forEach((player, index) => {
      const normalizedRiotId = player.riotId.toLowerCase();
      if (riotIdSet.has(normalizedRiotId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate Riot IDs are not allowed.",
          path: ["players", index, "riotId"],
        });
      } else {
        riotIdSet.add(normalizedRiotId);
      }

      const normalizedDiscordId = player.discordId.toLowerCase();
      if (discordSet.has(normalizedDiscordId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate Discord IDs are not allowed.",
          path: ["players", index, "discordId"],
        });
      } else {
        discordSet.add(normalizedDiscordId);
      }
    });

    const captainExists = payload.players.some(
      (player) =>
        player.discordId.toLowerCase() === payload.captainDiscordId.toLowerCase(),
    );

    if (!captainExists) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Captain Discord ID must match one of the players.",
        path: ["captainDiscordId"],
      });
    }
  });

export const soloRegistrationSchema = z.object({
  name: textSchema.min(2, "Player name must be at least 2 characters."),
  riotId: riotIdSchema,
  discordId: discordIdSchema,
  preferredRole: roleSchema,
  eventId: textSchema.min(1, "Event ID is required."),
  registrationToken: optionalRegistrationTokenSchema,
  email: optionalEmailSchema,
  currentRank: rankSchema.optional(),
  peakRank: rankSchema.optional(),
});

export const registrationStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const approveRegistrationSchema = z.object({
  registrationId: textSchema.min(1, "Registration ID is required."),
});

export const rejectRegistrationSchema = approveRegistrationSchema.extend({
  reason: textSchema
    .min(3, "Rejection reason must be at least 3 characters.")
    .max(240, "Rejection reason cannot exceed 240 characters.")
    .optional(),
});

const soloPlayerIdsSchema = z
  .array(textSchema.min(1, "Solo player ID cannot be empty."))
  .min(1, "At least one solo player must be selected.")
  .max(200, "You can select at most 200 solo players per request.")
  .superRefine((ids, ctx) => {
    const seen = new Set<string>();
    ids.forEach((id, index) => {
      const normalized = id.toLowerCase();
      if (seen.has(normalized)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate solo player IDs are not allowed.",
          path: [index],
        });
      } else {
        seen.add(normalized);
      }
    });
  });

export const adminEventScopedQuerySchema = z.object({
  eventId: textSchema.min(1, "eventId query parameter is required."),
  limit: z
    .preprocess(
      (value) => {
        if (value === undefined || value === null || value === "") {
          return undefined;
        }

        if (typeof value === "string") {
          return Number(value);
        }

        return value;
      },
      z
        .number()
        .int("limit must be an integer.")
        .min(1, "limit must be at least 1.")
        .max(200, "limit must be at most 200.")
        .optional(),
    )
    .optional(),
});

export const adminRandomTeamCreationSchema = z
  .object({
    eventId: textSchema.min(1, "Event ID is required."),
    soloPlayerIds: soloPlayerIdsSchema.min(
      5,
      "At least 5 solo players are required to create teams.",
    ),
    teamSize: z.literal(5).optional(),
  })
  .superRefine((payload, ctx) => {
    if (payload.soloPlayerIds.length % 5 !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selected solo player count must be divisible by 5.",
        path: ["soloPlayerIds"],
      });
    }
  });

export const adminAssignSoloPlayersSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  teamId: textSchema.min(1, "Team ID is required."),
  soloPlayerIds: soloPlayerIdsSchema,
});

export const adminLoginSchema = z.object({
  email: textSchema.toLowerCase().email("Email must be valid."),
  password: z.string().min(1, "Password is required."),
});

const otpSchema = textSchema.regex(/^\d{6}$/, "OTP must be a 6-digit code.");

export const adminMfaChallengeVerifySchema = z.object({
  challengeId: textSchema.min(1, "Challenge ID is required."),
  otp: otpSchema,
});

export const adminMfaEnrollmentVerifySchema = z.object({
  otp: otpSchema,
});

const registrationLinkMetaSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
  .optional();
const optionalMatchRefSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0 ? undefined : value,
  textSchema.max(64, "Reference cannot exceed 64 characters.").optional(),
);
const matchMapRefSchema = textSchema
  .min(1, "Map is required.")
  .max(64, "Map cannot exceed 64 characters.");
const optionalPointsSchema = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.number().int().optional(),
);

export const eventStatusValueSchema = eventStatusSchema;
export const matchStatusValueSchema = matchStatusSchema;

const eventMutableSchema = z.object({
  name: textSchema.min(2, "Event name must be at least 2 characters.").max(120),
  slug: textSchema
    .min(2, "Event slug must be at least 2 characters.")
    .max(80, "Event slug cannot exceed 80 characters."),
  code: textSchema
    .min(2, "Event code must be at least 2 characters.")
    .max(32, "Event code cannot exceed 32 characters."),
  status: eventStatusSchema,
  startsAt: isoDatetimeSchema,
  endsAt: isoDatetimeSchema,
  registrationOpensAt: isoDatetimeSchema,
  registrationClosesAt: isoDatetimeSchema,
  registrationLinkToken: optionalRegistrationTokenSchema,
  registrationLinkMeta: registrationLinkMetaSchema,
});

function appendEventWindowValidation(
  payload: {
    startsAt?: string;
    endsAt?: string;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (
    payload.startsAt !== undefined &&
    payload.endsAt !== undefined &&
    Date.parse(payload.endsAt) < Date.parse(payload.startsAt)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Event end date must be after start date.",
      path: ["endsAt"],
    });
  }

  if (
    payload.registrationOpensAt !== undefined &&
    payload.registrationClosesAt !== undefined &&
    Date.parse(payload.registrationClosesAt) < Date.parse(payload.registrationOpensAt)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Registration close must be after registration open.",
      path: ["registrationClosesAt"],
    });
  }
}

export const eventSchema = eventMutableSchema
  .extend({
    id: textSchema.min(1, "Event ID is required."),
    createdAt: isoDatetimeSchema.nullable(),
    updatedAt: isoDatetimeSchema.nullable(),
  })
  .superRefine((payload, ctx) => {
    appendEventWindowValidation(payload, ctx);
  });

export const createEventPayloadSchema = eventMutableSchema
  .extend({
    status: eventStatusSchema.optional(),
  })
  .superRefine((payload, ctx) => {
    appendEventWindowValidation(payload, ctx);
  });

export const updateEventPayloadSchema = eventMutableSchema
  .partial()
  .extend({
    eventId: textSchema.min(1, "Event ID is required."),
  })
  .superRefine((payload, ctx) => {
    const hasAtLeastOneUpdate = Object.entries(payload).some(
      ([key, value]) => key !== "eventId" && value !== undefined,
    );

    if (!hasAtLeastOneUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one event field must be provided for update.",
        path: [],
      });
    }

    appendEventWindowValidation(payload, ctx);
  });

export const eventTransitionPayloadSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
});

export const adminMvpQuerySchema = z.object({
  eventId: textSchema.min(1, "eventId query parameter is required."),
});

export const riotSyncPayloadSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  matchIds: z.array(textSchema.min(1)).max(100).optional(),
  playerIds: z.array(textSchema.min(1)).max(100).optional(),
  maxMatchesPerPlayer: z.number().int().min(1).max(20).optional(),
});

const matchMutableSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  homeTeamId: textSchema.min(1, "Home team ID is required."),
  awayTeamId: textSchema.min(1, "Away team ID is required."),
  mapRef: matchMapRefSchema,
  playedAt: isoDatetimeSchema,
  status: matchStatusSchema,
  homeScore: z.number().int().min(0),
  awayScore: z.number().int().min(0),
});

function appendMatchTeamValidation(
  payload: {
    homeTeamId?: string;
    awayTeamId?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (
    payload.homeTeamId !== undefined &&
    payload.awayTeamId !== undefined &&
    payload.homeTeamId === payload.awayTeamId
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Home and away teams must be different.",
      path: ["awayTeamId"],
    });
  }
}

export const matchSchema = matchMutableSchema
  .extend({
    id: textSchema.min(1, "Match ID is required."),
  })
  .superRefine((payload, ctx) => {
    appendMatchTeamValidation(payload, ctx);
  });

export const createMatchPayloadSchema = matchMutableSchema
  .extend({
    id: textSchema.min(1, "Match ID is required.").optional(),
  })
  .superRefine((payload, ctx) => {
    appendMatchTeamValidation(payload, ctx);
  });

export const updateMatchPayloadSchema = matchMutableSchema
  .partial()
  .extend({
    matchId: textSchema.min(1, "Match ID is required."),
    mapRef: matchMapRefSchema,
  })
  .superRefine((payload, ctx) => {
    const hasAtLeastOneUpdate = Object.entries(payload).some(
      ([key, value]) => key !== "matchId" && value !== undefined,
    );

    if (!hasAtLeastOneUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one match field must be provided for update.",
        path: [],
      });
    }

    appendMatchTeamValidation(payload, ctx);
  });

export const teamStandingAggregateSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  teamId: textSchema.min(1, "Team ID is required."),
  teamName: textSchema.min(1, "Team name is required."),
  wins: z.number().int().min(0),
  losses: z.number().int().min(0),
  matchesPlayed: z.number().int().min(0),
  roundDiff: z.number().int(),
  points: optionalPointsSchema,
});

export const mapRecordSchema = z.object({
  id: textSchema.min(1, "Map ID is required."),
  key: textSchema.min(1, "Map key is required."),
  name: textSchema.min(1, "Map name is required."),
  sortOrder: z.number().int().min(1),
  isActive: z.boolean(),
});

const playerStatMutableSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  playerId: textSchema.min(1, "Player ID is required."),
  teamId: textSchema.min(1, "Team ID is required."),
  matchId: textSchema.min(1, "Match ID is required."),
  mapRef: textSchema.min(1, "Map is required."),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
});

export const playerStatAggregateSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  playerId: textSchema.min(1, "Player ID is required."),
  teamId: textSchema.min(1, "Team ID is required."),
  matchId: optionalMatchRefSchema,
  mapRef: optionalMatchRefSchema,
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  matchesPlayed: z.number().int().min(0),
  mapsPlayed: z.number().int().min(0),
});

export const playerStatRecordSchema = playerStatAggregateSchema.extend({
  id: textSchema.min(1, "Player stat ID is required."),
});

export const createPlayerStatPayloadSchema = playerStatMutableSchema.extend({
  id: textSchema.min(1, "Player stat ID is required.").optional(),
});

export const updatePlayerStatPayloadSchema = playerStatMutableSchema
  .partial()
  .extend({
    playerStatId: textSchema.min(1, "Player stat ID is required."),
  })
  .superRefine((payload, ctx) => {
    const hasAtLeastOneUpdate = Object.entries(payload).some(
      ([key, value]) => key !== "playerStatId" && value !== undefined,
    );

    if (!hasAtLeastOneUpdate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one player stat field must be provided for update.",
        path: [],
      });
    }
  });

export const mvpCandidateSchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  playerId: textSchema.min(1, "Player ID is required."),
  teamId: textSchema.min(1, "Team ID is required."),
  kills: z.number().int().min(0),
  deaths: z.number().int().min(0),
  assists: z.number().int().min(0),
  matchesPlayed: z.number().int().min(0),
  roundDiff: z.number().int(),
  points: optionalPointsSchema,
  score: z.number(),
  rank: z.number().int().min(1),
});

export const mvpSummarySchema = z.object({
  eventId: textSchema.min(1, "Event ID is required."),
  generatedAt: isoDatetimeSchema,
  topCandidate: mvpCandidateSchema.optional(),
  candidates: z.array(mvpCandidateSchema),
});
