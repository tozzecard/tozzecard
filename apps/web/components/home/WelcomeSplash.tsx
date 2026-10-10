"use client";
import gsap from "gsap";
import Image from "next/image";
import { useLayoutEffect, useRef } from "react";

/**
 * The short welcome shown when Home switches between the card and the agent wallet, the way the
 * Binance app greets you when it switches to Wallet. It fades in, holds, fades out, then calls
 * `onDone`; reduced motion skips straight to the end.
 */
export function WelcomeSplash({ label, onDone }: { label: string; onDone: () => void }) {
  const root = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone();
      return;
    }
    const tl = gsap.timeline({ onComplete: onDone });
    tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power2.out" })
      .fromTo(
        el.querySelectorAll("[data-line]"),
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.35, stagger: 0.08, ease: "power3.out" },
        "<",
      )
      .to(el, { opacity: 0, duration: 0.25, ease: "power2.in" }, "+=0.55");
    return () => {
      tl.kill();
    };
  }, [onDone]);

  return (
    <div
      ref={root}
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[80] flex items-center bg-[#111316] px-8 text-white opacity-0"
    >
      <div>
        <div data-line className="text-[15px] text-white/75">
          Welcome to
        </div>
        <div data-line className="mt-3 flex items-center gap-3">
          <Image src="/tozzecard-icon.svg" alt="" width={44} height={44} priority />
          <span className="text-[34px] font-semibold tracking-[-0.03em] text-[#F0B90B]">
            Tozzecard
          </span>
          <span className="text-[34px] font-light tracking-[-0.02em] text-white">{label}</span>
        </div>
      </div>
    </div>
  );
}
