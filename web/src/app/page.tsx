import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <main className="hero">
      <div className="hero-inner">
        <div className="brand-mark" aria-hidden>
          <DoorIcon />
        </div>
        <h1>Smart Door</h1>
        <p className="lead">
          Someone at the door types the number on the screen. You get a one-time code on Telegram.
          The door opens only when that code is entered.
        </p>
        <ol className="flow">
          <li><span>1</span>Ultrasonic sensor detects a visitor</li>
          <li><span>2</span>Visitor types the random number shown on the OLED</li>
          <li><span>3</span>A 4-digit OTP is sent to your Telegram</li>
          <li><span>4</span>Correct OTP opens the door. Wrong OTP alerts you</li>
        </ol>
        <div className="row gap">
          <Link className="btn primary" href="/register">Create account</Link>
          <Link className="btn" href="/login">Log in</Link>
        </div>
      </div>
    </main>
  );
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" />
      <path d="M3 21h18" />
      <circle cx="15" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
