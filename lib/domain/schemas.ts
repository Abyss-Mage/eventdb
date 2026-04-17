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
