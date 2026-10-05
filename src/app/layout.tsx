import type { Metadata, Viewport } from "next";
import "./globals.css";
import React from "react";
import { Hanken_Grotesk } from "next/font/google";
import { defaultColor, defaultTexture } from "./themes";

export const metadata: Metadata = {
  title: "Arcana Domine",
  description:
    "Manage your LARP campaigns, events, and characters in one place. A multi-tenant platform for Live Action Role-Playing campaign management.",
  icons: {
    apple: "/mobile/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Arcana Domine",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f3ec",
  colorScheme: "only light",
};

// Istanza unica di Hanken Grotesk: applicata su <html>, copre dashboard e
// landing pubblica (vedi (front)/corporate.module.css e Login/theme.ts).
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-hanken-grotesk",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="it"
      data-color={defaultColor}
      data-texture={defaultTexture}
      suppressHydrationWarning
      className={hankenGrotesk.variable}
    >
      <head>
        {(process.env.NODE_ENV === "development" ||
          process.env.ENABLE_REACT_SCAN === "true") && (
          <script
            src="https://unpkg.com/react-scan/dist/auto.global.js"
            async
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
