import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StadiumOS — Live Crowd Operations Console",
  description:
    "Real-time stadium crowd simulation and operations console: live density, flow, and scenario drills across parallel realities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
