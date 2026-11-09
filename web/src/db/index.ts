import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// Neon's HTTP driver talks over HTTPS (port 443), so it works even where
// the raw Postgres port (5432) is blocked.
export const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
export * from "./schema";
