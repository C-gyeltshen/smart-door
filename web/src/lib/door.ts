/**
 * Core door-access logic, shared by the device API and the Telegram bot.
 *
 * Flow:
 *  1. startSession     - ultrasonic sensor saw someone; we create a random challenge number
 *                        that the device shows on the OLED.
 *  2. submitChallenge  - visitor typed the number on the keypad. If correct, a 4-digit OTP
 *                        is generated and sent to the owner's Telegram.
 *  3. submitOtp        - the OTP is typed on the keypad. Correct -> door opens.
 *                        Wrong -> owner is notified. Too many wrong -> session locked.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, accessSessions, devices, events, type Device, type User } from "@/db";
import { config } from "./config";
import { hashOtp, randomDigits, safeEqual } from "./crypto";
import { editMessage, escapeHtml, sendMessage } from "./telegram";

export async function logEvent(deviceId: string, type: string, message: string) {
  await db.insert(events).values({ deviceId, type, message });
}

const label = (d: Device) => escapeHtml(d.location ? `${d.name} (${d.location})` : d.name);
const timeStr = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

async function notifyOwner(owner: User, text: string) {
  if (owner.telegramChatId) await sendMessage(owner.telegramChatId, text);
}

async function loadSession(deviceId: string, sessionId: unknown) {
  if (typeof sessionId !== "string") return null;
  return (
    (await db.query.accessSessions.findFirst({
      where: and(eq(accessSessions.id, sessionId), eq(accessSessions.deviceId, deviceId)),
    })) ?? null
  );
}

async function setStatus(sessionId: string, status: string) {
  await db.update(accessSessions).set({ status }).where(eq(accessSessions.id, sessionId));
}

// ---------------------------------------------------------------- step 1
export async function startSession(device: Device) {
  // Close any session the device abandoned (visitor walked away etc.)
  await db
    .update(accessSessions)
    .set({ status: "EXPIRED" })
    .where(and(eq(accessSessions.deviceId, device.id), inArray(accessSessions.status, ["CHALLENGE", "OTP_SENT"])));

  const challenge = randomDigits(4);
  const [session] = await db
    .insert(accessSessions)
    .values({
      deviceId: device.id,
      challenge,
      challengeExpiresAt: new Date(Date.now() + config.challengeTtlMs),
    })
    .returning();

  await logEvent(device.id, "PRESENCE", "Visitor detected at the door");
  return {
    sessionId: session.id,
    challenge,
    expiresIn: Math.round(config.challengeTtlMs / 1000),
  };
}

// ---------------------------------------------------------------- step 2
export type ChallengeResult =
  | { result: "otp_sent"; otpExpiresIn: number; telegramSent: boolean }
  | { result: "wrong"; attemptsLeft: number }
  | { result: "locked" | "expired" | "invalid_session" | "no_telegram" };

export async function submitChallenge(device: Device, owner: User, sessionId: unknown, input: unknown): Promise<ChallengeResult> {
  const session = await loadSession(device.id, sessionId);
  if (!session || session.status !== "CHALLENGE") return { result: "invalid_session" };

  if (session.challengeExpiresAt.getTime() < Date.now()) {
    await setStatus(session.id, "EXPIRED");
    await logEvent(device.id, "EXPIRED", "Challenge number timed out");
    return { result: "expired" };
  }

  if (String(input ?? "") !== session.challenge) {
    const attempts = session.challengeAttempts + 1;
    const left = config.maxAttempts - attempts;
    await db
      .update(accessSessions)
      .set({ challengeAttempts: attempts, status: left <= 0 ? "FAILED" : "CHALLENGE" })
      .where(eq(accessSessions.id, session.id));
    await logEvent(device.id, "CHALLENGE_FAIL", `Wrong number entered (${attempts}/${config.maxAttempts})`);
    if (left <= 0) {
      await logEvent(device.id, "LOCKOUT", "Too many wrong numbers - session closed");
      return { result: "locked" };
    }
    return { result: "wrong", attemptsLeft: left };
  }

  if (!owner.telegramChatId) {
    await setStatus(session.id, "FAILED");
    await logEvent(device.id, "ERROR", "Owner has not connected Telegram - cannot send OTP");
    return { result: "no_telegram" };
  }

  const otp = randomDigits(4);
  const otpExpiresAt = new Date(Date.now() + config.otpTtlMs);
  await db
    .update(accessSessions)
    .set({ status: "OTP_SENT", otpHash: hashOtp(session.id, otp), otpExpiresAt })
    .where(eq(accessSessions.id, session.id));

  const minutes = Math.round(config.otpTtlMs / 60000);
  const messageId = await sendMessage(
    owner.telegramChatId,
    `🔔 <b>Someone is at ${label(device)}</b>\n\n` +
      `Your one-time password is:\n<b><code>${otp}</code></b>\n\n` +
      `Enter it on the door keypad within ${minutes} min to open the door.\n` +
      `Not expecting anyone? Tap <b>Deny</b>.`,
    { inline_keyboard: [[{ text: "🚫 Deny entry", callback_data: `deny:${session.id}` }]] }
  );
  if (messageId) {
    await db.update(accessSessions).set({ telegramMessageId: messageId }).where(eq(accessSessions.id, session.id));
  }

  await logEvent(device.id, "CHALLENGE_OK", "Correct number entered");
  await logEvent(device.id, "OTP_SENT", messageId ? "OTP sent to owner on Telegram" : "OTP generated but Telegram delivery failed");
  return { result: "otp_sent", otpExpiresIn: Math.round(config.otpTtlMs / 1000), telegramSent: Boolean(messageId) };
}

// ---------------------------------------------------------------- step 3
export type OtpResult =
  | { result: "granted"; unlockSeconds: number }
  | { result: "wrong"; attemptsLeft: number }
  | { result: "locked" | "expired" | "denied" | "invalid_session" };

export async function submitOtp(device: Device, owner: User, sessionId: unknown, otp: unknown): Promise<OtpResult> {
  const session = await loadSession(device.id, sessionId);
  if (!session) return { result: "invalid_session" };
  if (session.status === "DENIED") return { result: "denied" };
  if (session.status !== "OTP_SENT" || !session.otpHash || !session.otpExpiresAt) return { result: "invalid_session" };

  if (session.otpExpiresAt.getTime() < Date.now()) {
    await setStatus(session.id, "EXPIRED");
    await logEvent(device.id, "EXPIRED", "OTP expired before it was entered");
    await notifyOwner(owner, `⌛ The OTP for ${label(device)} expired without being used.`);
    return { result: "expired" };
  }

  if (safeEqual(hashOtp(session.id, String(otp ?? "")), session.otpHash)) {
    await setStatus(session.id, "GRANTED");
    await logEvent(device.id, "UNLOCKED", "Correct OTP - door opened");
    if (owner.telegramChatId && session.telegramMessageId) {
      await editMessage(owner.telegramChatId, session.telegramMessageId, `✅ OTP used - ${label(device)} was opened at ${timeStr()}.`);
    } else {
      await notifyOwner(owner, `✅ ${label(device)} was opened with the OTP at ${timeStr()}.`);
    }
    return { result: "granted", unlockSeconds: config.unlockSeconds };
  }

  const attempts = session.otpAttempts + 1;
  const left = config.maxAttempts - attempts;
  await db
    .update(accessSessions)
    .set({ otpAttempts: attempts, status: left <= 0 ? "FAILED" : "OTP_SENT" })
    .where(eq(accessSessions.id, session.id));
  await logEvent(device.id, "OTP_FAIL", `Wrong OTP entered (${attempts}/${config.maxAttempts})`);

  if (left <= 0) {
    await logEvent(device.id, "LOCKOUT", "Too many wrong OTPs - session locked");
    await notifyOwner(
      owner,
      `🚨 <b>Security alert</b>\nWrong OTP entered ${attempts} times at ${label(device)} (${timeStr()}). The OTP has been cancelled.`
    );
    return { result: "locked" };
  }
  await notifyOwner(
    owner,
    `⚠️ <b>Incorrect OTP</b> entered at ${label(device)} (${timeStr()}). ${left} attempt${left === 1 ? "" : "s"} left.`
  );
  return { result: "wrong", attemptsLeft: left };
}

// ---------------------------------------------------------------- owner actions
/** Owner tapped "Deny" in Telegram. Returns a short message for the callback toast. */
export async function denySession(ownerChatId: string, sessionId: string) {
  const rows = await db
    .select({ session: accessSessions, device: devices })
    .from(accessSessions)
    .innerJoin(devices, eq(accessSessions.deviceId, devices.id))
    .where(eq(accessSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, text: "Request not found" };

  const owner = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, row.device.ownerId) });
  if (!owner || owner.telegramChatId !== ownerChatId) return { ok: false, text: "Not your door" };
  if (row.session.status !== "OTP_SENT" && row.session.status !== "CHALLENGE") {
    return { ok: false, text: "This request is already closed" };
  }

  await setStatus(sessionId, "DENIED");
  await logEvent(row.device.id, "DENIED", "Owner denied entry from Telegram");
  if (row.session.telegramMessageId) {
    await editMessage(ownerChatId, row.session.telegramMessageId, `🚫 You denied entry at ${label(row.device)} (${timeStr()}). The OTP is cancelled.`);
  }
  return { ok: true, text: "Entry denied" };
}

/** Latest status of a session, so the door can react quickly to "Deny". */
export async function sessionStatus(device: Device, sessionId: unknown) {
  const s = await loadSession(device.id, sessionId);
  return s?.status ?? "UNKNOWN";
}
