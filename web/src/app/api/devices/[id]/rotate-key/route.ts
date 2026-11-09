import { and, eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { generateDeviceKey, sha256 } from "@/lib/crypto";
import { error, json } from "@/lib/http";

/** Issue a new API key (the old one stops working immediately). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  const { id } = await params;
  const apiKey = generateDeviceKey();
  const updated = await db
    .update(devices)
    .set({ apiKeyHash: sha256(apiKey) })
    .where(and(eq(devices.id, id), eq(devices.ownerId, user.id)))
    .returning({ id: devices.id });
  if (!updated.length) return error("Door not found", 404);
  return json({ apiKey });
}
