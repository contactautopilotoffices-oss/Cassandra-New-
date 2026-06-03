import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "SaaS Mobile Server",
  description: "Vercel-hosted backend for the SaaS mobile application."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
