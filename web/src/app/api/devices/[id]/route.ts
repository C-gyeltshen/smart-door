import { and, eq } from "drizzle-orm";
import { db, devices } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { error, json } from "@/lib/http";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  const { id } = await params;
  const deleted = await db
    .delete(devices)
    .where(and(eq(devices.id, id), eq(devices.ownerId, user.id)))
    .returning({ id: devices.id });
  if (!deleted.length) return error("Door not found", 404);
  return json({ ok: true });
}
