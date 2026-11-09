import { and, eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { logEvent } from "@/lib/door";
import { error, json } from "@/lib/http";

/** Owner pressed "Remote unlock" on the dashboard. Delivered on the door's next heartbeat. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  const { id } = await params;
  const updated = await db
    .update(devices)
    .set({ pendingCommand: "unlock" })
    .where(and(eq(devices.id, id), eq(devices.ownerId, user.id)))
    .returning({ id: devices.id });
  if (!updated.length) return error("Door not found", 404);
  await logEvent(id, "REMOTE_UNLOCK", "Owner unlocked the door from the web dashboard");
  return json({ ok: true });
}
