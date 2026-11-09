import { authenticateDevice } from "@/lib/device-auth";
import { startSession } from "@/lib/door";
import { error, json } from "@/lib/http";

/** Called by the door when the ultrasonic sensor detects a person. */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth) return error("Invalid device key", 401);
  return json(await startSession(auth.device));
}
