import type { Metadata, Viewport } from "next";
import "./globals.css";
import { switzer } from "../lib/fonts";
import { CardProvider } from "../providers/CardProvider";
import { ToastProvider } from "../providers/ToastProvider";

export const metadata: Metadata = {
  title: "Tozzecard",
  description: "Your stocks, ready to spend.",
  icons: {
    icon: [{ url: "/tozzecard-icon.svg", type: "image/svg+xml" }],
    apple: "/tozzecard-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${switzer.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <CardProvider>
          <ToastProvider>{children}</ToastProvider>
        </CardProvider>
      </body>
    </html>
  );
}
