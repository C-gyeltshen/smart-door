import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { setSessionCookie } from "@/lib/auth";
import { error, json, readJson } from "@/lib/http";

export async function POST(req: Request) {
  const { email, password } = await readJson<{ email: string; password: string }>(req);
  const user = await db.query.users.findFirst({
    where: eq(users.email, String(email ?? "").trim().toLowerCase()),
  });
  if (!user || !(await bcrypt.compare(String(password ?? ""), user.passwordHash))) {
    return error("Wrong email or password", 401);
  }
  await setSessionCookie(user.id);
  return json({ ok: true });
}
