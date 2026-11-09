import { authenticateDevice } from "@/lib/device-auth";
import { submitChallenge } from "@/lib/door";
import { error, json, readJson } from "@/lib/http";

/** Body: { sessionId, code }  - the number the visitor typed on the keypad. */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth) return error("Invalid device key", 401);
  const body = await readJson<{ sessionId: string; code: string }>(req);
  return json(await submitChallenge(auth.device, auth.owner, body.sessionId, body.code));
}
