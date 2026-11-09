import { db, devices } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { generateDeviceKey, sha256 } from "@/lib/crypto";
import { error, json, readJson } from "@/lib/http";

/** Register a new door. The API key is returned ONCE - it goes into the ESP32 config. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Not logged in", 401);
  const { name, location } = await readJson<{ name: string; location: string }>(req);
  const cleanName = String(name ?? "").trim().slice(0, 60);
  if (!cleanName) return error("Give the door a name, e.g. Front Door");

  const apiKey = generateDeviceKey();
  const [device] = await db
    .insert(devices)
    .values({
      name: cleanName,
      location: String(location ?? "").trim().slice(0, 80),
      apiKeyHash: sha256(apiKey),
      ownerId: user.id,
    })
    .returning({ id: devices.id, name: devices.name });
  return json({ device, apiKey }, 201);
}
