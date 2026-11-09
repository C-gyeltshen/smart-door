import { eq } from "drizzle-orm";
import { db, devices, users } from "@/db";
import { sha256 } from "./crypto";

/**
 * Devices authenticate with:  Authorization: Bearer sd_xxxxxxxx
 * Returns the device and its owner, and records that the device is alive.
 */
export async function authenticateDevice(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!key) return null;

  const rows = await db
    .select({ device: devices, owner: users })
    .from(devices)
    .innerJoin(users, eq(devices.ownerId, users.id))
    .where(eq(devices.apiKeyHash, sha256(key)))
    .limit(1);
  if (!rows[0]) return null;

  await db.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, rows[0].device.id));
  return rows[0];
}
