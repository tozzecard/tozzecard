"use client";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { STORAGE } from "../lib/storage";
import { Button } from "./ui";
import { Dialog } from "./ui/Dialog";

/** The production app, which a phone can open; on localhost the QR would point nowhere useful. */
const APP_URL = "https://app.tozzecard.xyz";

/**
 * Shown once, on a desktop, before onboarding: Tozzecard is built for a phone (Face ID, scanning a
 * merchant's QR, a card in your pocket), so it offers a QR to carry on there. Continuing on
 * desktop is always allowed and remembered on this device.
 */
export function DesktopNotice() {
  const isDesktop = useIsDesktop();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(STORAGE.desktopOk) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const stay = () => {
    try {
      window.localStorage.setItem(STORAGE.desktopOk, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <Dialog open={isDesktop && !dismissed} onClose={stay} label="Best on your phone">
      <div className="flex flex-col items-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-pill text-ink">
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="6" y="2" width="12" height="20" rx="3" />
            <path d="M11 18h2" />
          </svg>
        </span>
        <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Best on your phone</h2>
        <p className="mt-1.5 max-w-[300px] text-[14px] text-muted">
          Face ID, scan to pay and your card all work best on mobile. Scan to open Tozzecard there.
        </p>
        <div className="mt-5 rounded-[20px] border border-line bg-white p-4">
          <QRCode value={APP_URL} size={148} />
        </div>
        <p className="mt-2 text-[12px] text-faint">app.tozzecard.xyz</p>
        <div className="mt-6 w-full">
          <Button type="button" variant="glass" onClick={stay}>
            Continue on desktop
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
