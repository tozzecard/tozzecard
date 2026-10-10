"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const TABS = [
  {
    href: "/home",
    label: "Card",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <path d="M3 10h18" />
      </>
    ),
  },
  {
    href: "/portfolio",
    label: "Stocks",
    icon: (
      <>
        <rect x="4" y="13" width="4" height="7" rx="1.5" fill="currentColor" stroke="none" />
        <rect x="10" y="9" width="4" height="11" rx="1.5" fill="currentColor" stroke="none" />
        <rect x="16" y="5" width="4" height="15" rx="1.5" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    href: "/agent",
    label: "Agent",
    icon: (
      <>
        <rect x="5" y="8" width="14" height="11" rx="3" />
        <path d="M12 4v4M9.5 13h.01M14.5 13h.01" />
      </>
    ),
  },
] as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <>
      {/* progressive blur overlay above the nav */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[38] h-[104px] overflow-hidden"
      >
        <div className="absolute inset-0 [backdrop-filter:blur(2px)] [mask-image:linear-gradient(to_top,#000_0%,#000_52%,transparent_100%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(5px)] [mask-image:linear-gradient(to_top,#000_0%,#000_30%,transparent_58%)]" />
        <div className="absolute inset-0 [backdrop-filter:blur(9px)] [mask-image:linear-gradient(to_top,#000_0%,#000_15%,transparent_36%)]" />
        <div className="absolute inset-0 [background:linear-gradient(180deg,transparent,rgba(242,242,242,.5))]" />
      </div>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[88px] items-start justify-around px-6 pt-2.5 pb-[calc(20px+env(safe-area-inset-bottom))]"
      >
        {TABS.map((t) => {
          const active = path === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-[52px] flex-col items-center justify-center gap-[3px] rounded-[18px] border px-[18px] text-[11px] font-medium transition-colors ${active ? "border-white bg-card text-ink [box-shadow:0_1px_2px_rgba(17,19,22,.04),0_10px_22px_-14px_rgba(17,19,22,.28)]" : "border-transparent text-faint hover:text-muted"}`}
            >
              <Icon>{t.icon}</Icon>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
