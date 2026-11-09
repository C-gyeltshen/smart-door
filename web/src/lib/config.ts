function num(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  otpTtlMs: num("OTP_TTL_SECONDS", 120) * 1000,
  challengeTtlMs: num("CHALLENGE_TTL_SECONDS", 60) * 1000,
  maxAttempts: num("MAX_ATTEMPTS", 3),
  unlockSeconds: num("UNLOCK_SECONDS", 5),
  /** A device counts as online if it was heard from within this window. */
  onlineWindowMs: 90 * 1000,
};

export function authSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short. Set it in .env");
  }
  return s;
}
