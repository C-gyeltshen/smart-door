import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Door",
  description: "IoT smart door with Telegram OTP verification",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
