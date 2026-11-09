import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { setSessionCookie } from "@/lib/auth";
import { error, json, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const { name, email, password } = await readJson<{ name: string; email: string; password: string }>(req);
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  const cleanName = String(name ?? "").trim();
  if (!cleanName) return error("Please enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return error("Please enter a valid email");
  if (String(password ?? "").length < 8) return error("Password must be at least 8 characters");

  const existing = await db.query.users.findFirst({ where: eq(users.email, cleanEmail) });
  if (existing) return error("An account with this email already exists", 409);

  const [user] = await db
    .insert(users)
    .values({ name: cleanName, email: cleanEmail, passwordHash: await bcrypt.hash(String(password), 10) })
    .returning({ id: users.id });
  await setSessionCookie(user.id);
  return json({ ok: true });
}
