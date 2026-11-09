import { authenticateDevice } from "@/lib/device-auth";
import { submitOtp } from "@/lib/door";
import { error, json, readJson } from "@/lib/http";

/** Body: { sessionId, otp }  - the 4-digit OTP typed on the keypad. */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth) return error("Invalid device key", 401);
  const body = await readJson<{ sessionId: string; otp: string }>(req);
  return json(await submitOtp(auth.device, auth.owner, body.sessionId, body.otp));
}
