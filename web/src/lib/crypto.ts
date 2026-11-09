import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { authSecret } from "./config";

/** Random numeric string with a fixed number of digits (leading zeros allowed). */
export function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += randomInt(0, 10).toString();
  return out;
}

/** Device API key shown to the owner once, e.g. "sd_3f9a...". */
export function generateDeviceKey(): string {
  return "sd_" + randomBytes(24).toString("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** OTPs are stored as keyed hashes so a leaked database doesn't reveal live codes. */
export function hashOtp(sessionId: string, otp: string): string {
  return createHmac("sha256", authSecret()).update(`${sessionId}:${otp}`).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
