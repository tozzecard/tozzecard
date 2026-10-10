import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "../index.css";

export const metadata: Metadata = {
  title: "Tozzecard",
  description: "Your stocks, ready to spend.",
  // The team icon (apps/web/public): its own dark tile, so one file reads on light and dark tab bars.
  icons: {
    icon: [{ url: "/tozzecard-icon.svg", type: "image/svg+xml" }],
    apple: "/tozzecard-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
