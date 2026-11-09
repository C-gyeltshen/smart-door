import { authenticateDevice } from "@/lib/device-auth";
import { sessionStatus } from "@/lib/door";
import { error, json } from "@/lib/http";

/** GET ?sessionId=...  - lets the door notice quickly if the owner tapped "Deny". */
export async function GET(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth) return error("Invalid device key", 401);
  const sessionId = new URL(req.url).searchParams.get("sessionId");
  return json({ status: await sessionStatus(auth.device, sessionId) });
}
