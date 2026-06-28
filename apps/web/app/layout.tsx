import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Film Intensity",
  description: "Crowd-sourced film intensity from Garmin biometric sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
