import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** Only logged-in owners can see the dashboard. */
export async function middleware(req: NextRequest) {
  const token = req.cookies.get("sd_session")?.value;
  let ok = false;
  if (token && process.env.AUTH_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      ok = true;
    } catch {}
  }
  if (!ok) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
