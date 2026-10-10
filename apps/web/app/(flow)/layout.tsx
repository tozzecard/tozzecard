"use client";
import type { ReactNode } from "react";
import { AuthGate } from "../../components/AuthGate";

/**
 * Full-screen tasks (pay, add money, settings). On desktop they render as a narrow centred column.
 */
export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      {/*
        `flex flex-col` so a screen inside can fill this column with `flex-1` instead of restating
        the padding set here. Twenty-one places across seven files carried
        `min-h-[calc(100dvh-92px)]`, and 92 is nothing but `pt-[52px]` plus `pb-10` added up by hand.
        Nothing connected the two, so changing the padding here would have left every flow screen
        the wrong height with no error anywhere. `min-h-dvh` with `border-box` already makes this
        content box exactly `100dvh - 92px`, so a `flex-1` child measures the same and keeps
        measuring the same.
      */}
      <div className="relative flex min-h-dvh flex-col bg-bg px-5 pb-10 pt-[52px] lg:mx-auto lg:max-w-[440px]">
        {children}
      </div>
    </AuthGate>
  );
}
