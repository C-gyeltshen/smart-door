import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { randomUUID } from "crypto";

const id = () => text("id").primaryKey().$defaultFn(() => randomUUID());
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  telegramChatId: text("telegram_chat_id").unique(),
  telegramUsername: text("telegram_username"),
  linkCode: text("link_code").unique(),
  linkCodeExpires: timestamp("link_code_expires", { withTimezone: true }),
  createdAt: createdAt(),
});

export const devices = pgTable("devices", {
  id: id(),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  apiKeyHash: text("api_key_hash").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // "unlock" when the owner presses Remote Unlock; cleared once the device picks it up
  pendingCommand: text("pending_command"),
  createdAt: createdAt(),
});

/**
 * One visitor interaction at the door:
 * CHALLENGE -> (correct number) -> OTP_SENT -> (correct OTP) -> GRANTED
 * Terminal states: GRANTED | DENIED | FAILED | EXPIRED
 */
export const accessSessions = pgTable(
  "access_sessions",
  {
    id: id(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("CHALLENGE"),
    challenge: text("challenge").notNull(),
    challengeExpiresAt: timestamp("challenge_expires_at", { withTimezone: true }).notNull(),
    challengeAttempts: integer("challenge_attempts").notNull().default(0),
    otpHash: text("otp_hash"),
    otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
    otpAttempts: integer("otp_attempts").notNull().default(0),
    telegramMessageId: integer("telegram_message_id"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_device_idx").on(t.deviceId, t.createdAt)]
);

export const events = pgTable(
  "events",
  {
    id: id(),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    // PRESENCE | CHALLENGE_OK | CHALLENGE_FAIL | OTP_SENT | OTP_FAIL | UNLOCKED |
    // REMOTE_UNLOCK | DENIED | LOCKOUT | EXPIRED | ERROR
    type: text("type").notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("events_device_idx").on(t.deviceId, t.createdAt)]
);

export type User = typeof users.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type AccessSession = typeof accessSessions.$inferSelect;
export type DoorEvent = typeof events.$inferSelect;
