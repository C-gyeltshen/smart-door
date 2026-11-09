import { eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { config } from "@/lib/config";
import { authenticateDevice } from "@/lib/device-auth";
import { error, json } from "@/lib/http";

/**
 * The door calls this every few seconds while idle.
 * Marks the device online and delivers pending commands (remote unlock).
 */
export async function POST(req: Request) {
  const auth = await authenticateDevice(req);
  if (!auth) return error("Invalid device key", 401);
  const command = auth.device.pendingCommand;
  if (command) {
    await db.update(devices).set({ pendingCommand: null }).where(eq(devices.id, auth.device.id));
  }
  return json({ command: command ?? null, unlockSeconds: config.unlockSeconds, name: auth.device.name });
}
