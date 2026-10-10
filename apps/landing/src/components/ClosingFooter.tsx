import gsap from "gsap";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { APP_URL } from "../app-url";

const FAQS: { question: string; answer: string }[] = [
  {
    question: "Who holds my money?",
    answer: "You. Stocks in your Binance wallet, dollars on your card.",
  },
  {
    question: "Can the agent send my money elsewhere?",
    answer: "No. Only to your card. Only you can change that, in the Binance App.",
  },
  {
    question: "What about weekends?",
    answer: "It sells only within 1% of Friday's close. Otherwise it waits.",
  },
  {
    question: "Why USD1?",
    answer: "It is a dollar. Binance pays the fee, so you never need BNB.",
  },
  {
    question: "Which stocks?",
    answer: "Ondo and bStocks on BNB Chain, like NVDA, AAPL and MSFT.",
  },
];

const FOOTER_LINKS: { heading: string; items: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    items: [
      { label: "How it works", href: "#start" },
      { label: "What you get", href: "#features" },
      { label: "Cardholders", href: "#cardholders" },
    ],
  },
  {
    heading: "Company",
    items: [
      { label: "GitHub", href: "https://github.com/tozzecard/tozzecard" },
      { label: "Docs", href: "https://github.com/tozzecard/tozzecard#readme" },
      { label: "BNB Chain", href: "https://www.bnbchain.org" },
    ],
  },
];

/**
 * The answer only exists while its question is open, so the reveal runs on mount
 * rather than on a class toggle. GSAP animates to `height: "auto"`, which CSS
 * transitions still cannot do without a hardcoded pixel height.
 */
function FaqAnswer({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(
      el,
      { height: 0, opacity: 0 },
      { height: "auto", opacity: 1, duration: 0.4, ease: "power2.out" },
    );
    return () => {
      tween.kill();
    };
  }, []);

  return (
    <div ref={ref} className="overflow-hidden">
      <p className="mt-3 text-[0.9rem] leading-[1.6] text-[#666]">{children}</p>
    </div>
  );
}

export function ClosingFooter({ logoSrc, faqId }: { logoSrc: string; faqId?: string }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  return (
    <div className="bg-white text-[#18161B]">
      <main className="mx-auto w-full max-w-[1100px] px-5 py-[60px] md:py-20">
        <div className="grid grid-cols-1 items-stretch gap-[60px] md:grid-cols-[1.6fr_1fr] md:gap-[30px]">
          <div
            className="cc-animated-gradient flex flex-col items-center justify-center rounded-[24px] px-6 py-14 text-center text-white sm:px-10 sm:py-20"
            style={{ boxShadow: "0 10px 30px rgba(0, 0, 0, 0.05)" }}
          >
            <h2
              className="mb-[15px] font-normal leading-[1.1]"
              // Was a flat 3.5rem, which does not shrink. On a 320px phone the
              // fixed size left the words with almost no gutter.
              style={{ fontSize: "clamp(2.25rem, 11vw, 3.5rem)", letterSpacing: "-0.03em" }}
            >
              Spend any day.
              <br />
              Sell on weekdays.
            </h2>
            <p className="mb-[30px] text-[0.95rem] font-normal opacity-85">
              Your card, filled on time.
            </p>
            <a
              href={APP_URL}
              target="_blank"
              rel="noreferrer"
              className="cursor-pointer border-none bg-[#18161B] text-[0.95rem] font-semibold text-white transition-transform duration-200 hover:-translate-y-0.5"
              style={{
                padding: "14px 32px",
                borderRadius: "12px",
                boxShadow: "0 10px 20px rgba(0,0,0,0.3)",
              }}
            >
              Get Tozzecard
            </a>
          </div>

          <div id={faqId} className="flex scroll-mt-24 flex-col justify-center gap-3">
            {FAQS.map((faq, index) => {
              const isActive = activeIndex === index;
              return (
                <button
                  type="button"
                  key={faq.question}
                  onClick={() => setActiveIndex(isActive ? null : index)}
                  className={`cursor-pointer rounded-[10px] border bg-white px-5 py-[18px] text-left transition-all duration-200 ${
                    isActive ? "border-[#eaeaea]" : "border-[#f0f0f0] hover:border-[#eaeaea]"
                  }`}
                  style={{
                    boxShadow: isActive
                      ? "0 4px 12px rgba(0,0,0,0.04)"
                      : "0 2px 8px rgba(0,0,0,0.02)",
                  }}
                  aria-expanded={isActive}
                >
                  <div className="flex items-center justify-between gap-3 text-[0.9rem] font-normal text-[#18161B]">
                    <span>{faq.question}</span>
                    {isActive ? (
                      <ChevronUp size={20} className="shrink-0" />
                    ) : (
                      <ChevronDown size={20} className="shrink-0" />
                    )}
                  </div>
                  {isActive && <FaqAnswer>{faq.answer}</FaqAnswer>}
                </button>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="rounded-t-[32px] bg-[#fafafa] pb-5 pt-[60px] md:rounded-t-[56px] md:pt-20">
        <div className="mx-auto w-full max-w-[1100px] px-5">
          <div className="mb-[50px] grid grid-cols-1 gap-10 min-[480px]:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* biome-ignore lint/performance/noImgElement: static asset that must paint the moment the step appears; next/image defers it */}
              <img src={logoSrc} alt="Tozzecard" className="mb-[15px] h-6 w-6" />
              <p className="max-w-[220px] text-[0.85rem] leading-[1.6] text-[#888]">
                Your stocks, ready to spend.
              </p>
            </div>

            {FOOTER_LINKS.map((column) => (
              <div key={column.heading}>
                <h4 className="mb-5 text-[0.95rem] font-semibold text-[#18161B]">
                  {column.heading}
                </h4>
                <ul>
                  {column.items.map((item) => (
                    <li key={item.label} className="mb-3">
                      <a
                        href={item.href}
                        className="text-[0.85rem] text-[#888] no-underline transition-colors duration-200 hover:text-[#18161B]"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-[15px] border-t border-[#f0f0f0] pb-[10px] pt-[25px] text-[0.85rem] text-[#888] min-[480px]:flex-row min-[480px]:justify-between">
            <span>Tozzecard, 2026</span>
            <span>Live on BNB Chain.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
