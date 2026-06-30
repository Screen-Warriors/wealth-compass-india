import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenText,
  CheckCircle2,
  ChevronDown,
  Download,
  IndianRupee,
  Lock,
  PiggyBank,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
  Zap,
} from "lucide-react";
import ebookHero from "@/assets/ebook-hero.png";
import {
  createEbookOrder,
  getCheckoutConfig,
  markEbookPaymentFailed,
  trackEbookEvent,
  verifyEbookPayment,
} from "@/lib/ebook-payments.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Take Control of Your Money — Personal Finance Ebook for India (₹99)" },
      {
        name: "description",
        content:
          "The practical personal finance guide for Indian Gen Z & Millennials. Budget smarter, save more, and build wealth — instant PDF for ₹99.",
      },
      { property: "og:title", content: "Take Control of Your Money — ₹99 Ebook" },
      {
        property: "og:description",
        content:
          "Budget smarter, kill debt, start investing. The no-jargon personal finance playbook for Indian Gen Z & Millennials.",
      },
      { property: "og:type", content: "product" },
      { property: "og:url", content: "/" },
    ],
    links: [
      { rel: "canonical", href: "/" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Take Control of Your Money — Personal Finance Ebook",
          description:
            "Practical personal finance guide for Indian Gen Z & Millennials.",
          offers: {
            "@type": "Offer",
            price: "99",
            priceCurrency: "INR",
            availability: "https://schema.org/InStock",
          },
        }),
      },
    ],
  }),
  component: LandingPage,
});

// --- Meta Pixel + conversion tracking helpers ---
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    Razorpay?: new (options: RazorpayOptions) => RazorpayCheckout;
  }
}

type RazorpayCheckout = {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailedResponse) => void) => void;
};

type RazorpaySuccessResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayFailedResponse = {
  error?: {
    description?: string;
    metadata?: {
      order_id?: string;
      payment_id?: string;
    };
  };
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  image?: string;
  method?: { upi?: boolean; card?: boolean; netbanking?: boolean; wallet?: boolean };
  notes?: Record<string, string>;
  retry?: { enabled: boolean; max_count?: number };
  theme?: { color: string };
  modal?: { confirm_close?: boolean; ondismiss?: () => void };
  handler: (response: RazorpaySuccessResponse) => void;
};

type CheckoutConfig = Awaited<ReturnType<typeof getCheckoutConfig>>;
type CtaHandler = () => void | Promise<void>;
type CtaButtonProps = {
  onCta: CtaHandler;
  loading?: boolean;
};

const track = (event: string, data?: Record<string, unknown>) => {
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("track", event, data);
  }
};

const initMetaPixel = (pixelId: string) => {
  if (typeof window === "undefined" || !pixelId || typeof window.fbq === "function") return;

  const fbq = function (...args: unknown[]) {
    const queue = (fbq as unknown as { queue: unknown[][] }).queue;
    queue.push(args);
  } as unknown as (...args: unknown[]) => void;

  (fbq as unknown as { queue: unknown[][]; loaded: boolean; version: string }).queue = [];
  (fbq as unknown as { queue: unknown[][]; loaded: boolean; version: string }).loaded = true;
  (fbq as unknown as { queue: unknown[][]; loaded: boolean; version: string }).version = "2.0";
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
};

const ensureRazorpayScript = () =>
  new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Checkout is unavailable right now."));
    if (window.Razorpay) return resolve();

    const waitForCheckout = () => {
      const startedAt = Date.now();
      const timer = window.setInterval(() => {
        if (window.Razorpay) {
          window.clearInterval(timer);
          resolve();
          return;
        }
        if (Date.now() - startedAt > 5000) {
          window.clearInterval(timer);
          reject(new Error("Could not load secure checkout. Please retry."));
        }
      }, 50);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load secure checkout. Please retry.")), { once: true });
      waitForCheckout();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load secure checkout. Please retry."));
    document.body.appendChild(script);
  });

function LandingPage() {
  const [showSticky, setShowSticky] = useState(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const fetchCheckoutConfig = useServerFn(getCheckoutConfig);
  const trackEvent = useServerFn(trackEbookEvent);
  const createOrder = useServerFn(createEbookOrder);
  const verifyPayment = useServerFn(verifyEbookPayment);
  const markPaymentFailed = useServerFn(markEbookPaymentFailed);

  useEffect(() => {
    let mounted = true;

    fetchCheckoutConfig()
      .then((config) => {
        if (!mounted) return;
        setCheckoutConfig(config);
        initMetaPixel(config.metaPixelId);
        track("ViewContent", { content_name: config.productName, value: config.price, currency: config.currency });
      })
      .catch((error) => {
        console.error("Could not load checkout config", error);
      });

    trackEvent({
      data: {
        eventName: "ViewContent",
        amountPaise: 9900,
        currency: "INR",
        source: "landing",
        referrer: document.referrer || undefined,
        landingPath: `${window.location.pathname}${window.location.search}`,
      },
    }).catch((error) => console.error("Could not track landing visit", error));

    const preloadCheckout = () => ensureRazorpayScript().catch(() => undefined);
    const onScroll = () => setShowSticky(window.scrollY > 480);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", preloadCheckout, { once: true, passive: true });
    return () => {
      mounted = false;
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", preloadCheckout);
    };
  }, [fetchCheckoutConfig, trackEvent]);

  const handleCheckout = async (location: string) => {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError(null);

    const productName = checkoutConfig?.productName ?? "Personal Finance for Gen Z & Millennials";
    const currency = checkoutConfig?.currency ?? "INR";

    track("InitiateCheckout", {
      content_name: productName,
      value: 99,
      currency,
      source: location,
    });

    try {
      await ensureRazorpayScript();
      const order = await createOrder({
        data: {
          source: location,
          referrer: document.referrer || undefined,
          landingPath: `${window.location.pathname}${window.location.search}`,
        },
      });

      if (!window.Razorpay) throw new Error("Secure checkout is unavailable. Please retry.");

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: "Money Playbook",
        description: order.productDescription,
        order_id: order.razorpayOrderId,
        method: { upi: true, card: true, netbanking: true, wallet: true },
        retry: { enabled: true, max_count: 3 },
        notes: {
          product_name: order.productName,
          receipt: order.receipt,
          source: location,
        },
        theme: { color: "#d9a13b" },
        modal: {
          confirm_close: true,
          ondismiss: () => setCheckoutLoading(false),
        },
        handler: async (response) => {
          try {
            const result = await verifyPayment({
              data: {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                source: location,
              },
            });

            track("Purchase", {
              content_name: order.productName,
              value: 99,
              currency: order.currency,
              order_id: response.razorpay_order_id,
            });
            await new Promise((resolve) => setTimeout(resolve, 250));
            window.location.href = result.redirectPath;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Payment verification failed.";
            setCheckoutError(message);
            setCheckoutLoading(false);
          }
        },
      });

      checkout.on("payment.failed", (response) => {
        const reason = response.error?.description || "Payment failed. Please retry with UPI, card, net banking, or wallet.";
        setCheckoutError(reason);
        setCheckoutLoading(false);
        track("PaymentFailed", { content_name: order.productName, value: 99, currency: order.currency, source: location });
        markPaymentFailed({
          data: {
            razorpayOrderId: response.error?.metadata?.order_id ?? order.razorpayOrderId,
            razorpayPaymentId: response.error?.metadata?.payment_id,
            reason,
            source: location,
          },
        }).catch((error) => console.error("Could not record payment failure", error));
      });

      checkout.open();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start checkout. Please try again.";
      setCheckoutError(message);
      setCheckoutLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AnnouncementBar />
      <CheckoutNotice error={checkoutError} loading={checkoutLoading} onRetry={() => handleCheckout("retry")} />
      <Hero onCta={() => handleCheckout("hero")} loading={checkoutLoading} />
      <SocialProof />
      <PainPoints />
      <WhatYoullLearn />
      <WhatsIncluded />
      <WhyDifferent />
      <Offer onCta={() => handleCheckout("offer")} loading={checkoutLoading} error={checkoutError} />
      <FAQ />
      <FinalCta onCta={() => handleCheckout("final")} loading={checkoutLoading} />
      <Footer />
      <StickyCta show={showSticky} onCta={() => handleCheckout("sticky")} loading={checkoutLoading} />
    </main>
  );
}

/* ---------------- Sections ---------------- */

function AnnouncementBar() {
  return (
    <div className="bg-primary text-primary-foreground text-[11px] sm:text-xs">
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center">
        <Sparkles className="size-3.5 text-gold" />
        <span className="font-medium tracking-wide">
          Launch offer — <span className="text-gold">67% OFF</span> · Today only ₹99
        </span>
      </div>
    </div>
  );
}

function CheckoutNotice({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: CtaHandler }) {
  if (!error) return null;

  return (
    <div className="sticky top-0 z-40 border-b border-destructive/20 bg-destructive/10 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
        <span>{error}</span>
        <button
          onClick={onRetry}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-xs font-semibold text-primary-foreground"
        >
          {loading ? "Retrying..." : "Retry payment"}
        </button>
      </div>
    </div>
  );
}

function Hero({ onCta, loading = false }: CtaButtonProps) {
  return (
    <section
      className="relative overflow-hidden text-primary-foreground"
      style={{ background: "var(--gradient-hero)" }}
    >
      {/* subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
      {/* gold glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 size-[520px] -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, oklch(0.78 0.15 75 / 0.35), transparent)" }}
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-5 pb-16 pt-10 sm:pt-14 md:grid-cols-2 md:items-center md:gap-8 md:px-8 md:pb-24 md:pt-20">
        <div className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium backdrop-blur">
            <span className="size-1.5 rounded-full bg-gold" />
            India's no-jargon money playbook
          </div>
          <h1 className="mt-5 text-[34px] font-semibold leading-[1.05] sm:text-5xl md:text-6xl">
            Take Control of Your Money{" "}
            <span className="text-gradient-gold">Before It's Too Late.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            The practical personal finance guide that helps Gen Z & Millennials
            budget smarter, save more, kill financial stress, and build wealth —
            step by step.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={onCta}
              disabled={loading}
              className="btn-gold group relative inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold sm:text-[15px]"
            >
              <span className="absolute inset-0 -z-10 rounded-2xl animate-pulse-ring" />
              {loading ? "Opening secure checkout..." : "Get Instant Access for ₹99"}
              {loading ? (
                <span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              ) : (
                <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
            <div className="flex items-center gap-2 text-sm text-white/70">
              <Download className="size-4 text-gold" />
              Instant PDF download after purchase
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/65">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-gold" /> Secure payment
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BadgeCheck className="size-4 text-gold" /> Made for India
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap className="size-4 text-gold" /> 2-min checkout
            </span>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-sm items-center justify-center md:max-w-none">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, oklch(0.78 0.15 75 / 0.25), transparent)" }}
          />
          <img
            src={ebookHero}
            alt="Personal finance ebook cover"
            width={1024}
            height={1024}
            className="animate-float w-[78%] max-w-[420px] drop-shadow-[0_40px_80px_rgba(0,0,0,0.55)]"
          />
          <FloatingStat
            className="absolute left-0 top-6 sm:left-2"
            icon={<TrendingUp className="size-4" />}
            label="Avg. saver"
            value="+₹8,200/mo"
          />
          <FloatingStat
            className="absolute bottom-6 right-0 sm:right-2"
            icon={<PiggyBank className="size-4" />}
            label="Readers"
            value="3,400+"
          />
        </div>
      </div>
    </section>
  );
}

function FloatingStat({
  className,
  icon,
  label,
  value,
}: {
  className?: string;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/15 bg-white/10 px-3.5 py-2.5 backdrop-blur-md ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 text-gold">{icon}<span className="text-[10px] uppercase tracking-wider text-white/60">{label}</span></div>
      <div className="text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function SocialProof() {
  const items = [
    { k: "3,400+", v: "Happy readers" },
    { k: "4.8★", v: "Avg. rating" },
    { k: "₹99", v: "One-time price" },
    { k: "PDF", v: "Instant access" },
  ];
  return (
    <section className="border-y border-border bg-muted/40">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-none sm:grid-cols-4">
        {items.map((i) => (
          <div key={i.v} className="bg-background px-4 py-5 text-center">
            <div className="font-display text-2xl font-semibold text-primary sm:text-3xl">{i.k}</div>
            <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{i.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Section({
  eyebrow,
  title,
  subtitle,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`px-5 py-16 sm:py-20 md:px-8 ${className ?? ""}`}>
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl font-semibold leading-tight text-primary sm:text-4xl md:text-[44px]">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">{subtitle}</p>
          )}
        </div>
        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}

function PainPoints() {
  const pains = [
    "Salary disappears before month end",
    "No idea how much you should be saving",
    "Constant fear of debt & instability",
    "Investing feels confusing & risky",
    "Financial independence feels far away",
    "Don't know how to start a side hustle",
  ];
  return (
    <Section
      eyebrow="Sound familiar?"
      title="If money stress is running your life — you're not alone."
      subtitle="Most young Indians were never taught this in school or college. Here's what we hear every single day:"
    >
      <ul className="grid gap-3 sm:grid-cols-2">
        {pains.map((p) => (
          <li
            key={p}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground"
          >
            <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              ✕
            </span>
            <span className="text-sm sm:text-base">{p}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function WhatYoullLearn() {
  const cards = [
    { icon: Wallet, t: "Smart budgeting system", d: "A simple monthly system that actually sticks — no spreadsheets needed." },
    { icon: ShieldCheck, t: "Emergency fund blueprint", d: "Exactly how much, where to park it, and how to build it on any salary." },
    { icon: TrendingUp, t: "Debt reduction strategy", d: "Crush EMIs, credit cards, and BNPL with a proven payoff order." },
    { icon: PiggyBank, t: "Beginner investing roadmap", d: "Mutual funds, index funds, SIPs — explained in plain English." },
    { icon: Sparkles, t: "Saving hacks for young Indians", d: "Real tactics to cut leaks without killing your lifestyle." },
    { icon: Zap, t: "Side hustle ideas", d: "12 ideas you can start this weekend — ranked by effort & income." },
    { icon: BookOpenText, t: "Financial independence plan", d: "Map your number and reach it 10 years faster than average." },
  ];
  return (
    <Section
      eyebrow="What's inside"
      title="What you'll actually learn."
      subtitle="No fluff. No jargon. Just the exact playbook to fix your money in a weekend."
      className="bg-muted/40"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ icon: Icon, t, d }) => (
          <div
            key={t}
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_oklch(0.18_0.06_260/0.35)]"
          >
            <div
              className="mb-4 inline-flex size-11 items-center justify-center rounded-xl text-gold-foreground"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Icon className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-primary">{t}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WhatsIncluded() {
  const items = [
    "Complete ebook (PDF)",
    "Plug-and-play budget worksheets",
    "Savings checklist",
    "Action templates",
    "Practical exercises",
    "Step-by-step implementation plan",
  ];
  return (
    <Section
      eyebrow="Everything you get"
      title="A complete toolkit — not just an ebook."
    >
      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2">
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4"
          >
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <span className="text-sm font-medium sm:text-base">{i}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function WhyDifferent() {
  const points = [
    { t: "Zero financial jargon", d: "Written like a friend explaining it over chai." },
    { t: "Built for Indian Gen Z & Millennials", d: "₹, SIPs, EPF, UPI — examples you actually relate to." },
    { t: "Action over theory", d: "Every chapter ends with a step you do today." },
    { t: "Finish in a weekend", d: "Read, apply, and feel in control by Monday." },
  ];
  return (
    <Section
      eyebrow="Why it's different"
      title="Made for real life — in India."
      className="bg-muted/40"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {points.map((p, i) => (
          <div key={p.t} className="rounded-2xl border border-border bg-card p-6">
            <div className="font-display text-3xl font-semibold text-gold">0{i + 1}</div>
            <h3 className="mt-2 text-lg font-semibold text-primary">{p.t}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground sm:text-base">{p.d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Offer({ onCta, loading = false, error }: CtaButtonProps & { error?: string | null }) {
  return (
    <section className="px-5 py-16 sm:py-20 md:px-8">
      <div className="mx-auto max-w-3xl">
        <div
          className="relative overflow-hidden rounded-3xl border border-border bg-primary p-6 text-primary-foreground sm:p-10"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full blur-3xl"
            style={{ background: "radial-gradient(closest-side, oklch(0.78 0.15 75 / 0.35), transparent)" }}
          />
          <div className="relative text-center">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-xs font-semibold text-gold">
              ⚡ Limited time launch pricing
            </div>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
              Today's price — <span className="text-gradient-gold">just ₹99</span>
            </h2>
            <div className="mt-4 flex items-baseline justify-center gap-3">
              <span className="text-lg text-white/55 line-through">₹299</span>
              <span className="font-display text-6xl font-semibold sm:text-7xl">
                <IndianRupee className="-mt-3 inline size-8 sm:size-10" />
                99
              </span>
            </div>
            <p className="mt-2 text-sm text-white/65">One-time payment · Lifetime access</p>

            <button
              onClick={onCta}
              disabled={loading}
              className="btn-gold mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold sm:w-auto"
            >
              {loading ? (
                <span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              ) : (
                <Download className="size-5" />
              )}
              {loading ? "Opening secure checkout..." : "Download Now for ₹99"}
            </button>

            {error && (
              <div className="mx-auto mt-4 max-w-md rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-white">
                {error} <button onClick={onCta} className="font-semibold text-gold underline">Retry payment</button>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-white/65">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-4 text-gold" /> Secure payment
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Zap className="size-4 text-gold" /> Instant access
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-gold" /> 100% safe checkout
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    {
      q: "Is this suitable for complete beginners?",
      a: "Yes — it's specifically written for people who've never managed money before. We start from zero, no prior knowledge needed.",
    },
    {
      q: "How do I receive the ebook?",
      a: "Instantly. The moment your payment is confirmed, you get a download link on screen and in your email.",
    },
    {
      q: "Is this relevant for Indian users?",
      a: "100%. Every example uses ₹, Indian salaries, SIPs, EPF, UPI and real Indian context — not American advice repackaged.",
    },
    {
      q: "Can students benefit from this?",
      a: "Absolutely. Whether you're on a stipend, allowance or first salary, the system scales to any income.",
    },
    {
      q: "Is there lifetime access?",
      a: "Yes. Pay once, keep it forever. You also get all future updates free.",
    },
  ];
  return (
    <Section eyebrow="FAQ" title="Questions, answered." className="bg-muted/40">
      <div className="mx-auto max-w-2xl divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {faqs.map((f, i) => (
          <FaqItem key={f.q} {...f} defaultOpen={i === 0} />
        ))}
      </div>
    </Section>
  );
}

function FaqItem({ q, a, defaultOpen }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-primary sm:text-base">{q}</span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        className={`grid overflow-hidden transition-all duration-300 ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="min-h-0">
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground sm:text-base">{a}</p>
        </div>
      </div>
    </div>
  );
}

function FinalCta({ onCta, loading = false }: CtaButtonProps) {
  return (
    <section
      className="relative overflow-hidden px-5 py-20 text-primary-foreground sm:py-28 md:px-8"
      style={{ background: "var(--gradient-hero)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 mx-auto size-[420px] -translate-y-1/3 rounded-full blur-3xl"
        style={{ background: "radial-gradient(closest-side, oklch(0.78 0.15 75 / 0.3), transparent)" }}
      />
      <div className="relative mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold leading-tight sm:text-5xl">
          Your future financial freedom starts with{" "}
          <span className="text-gradient-gold">one small decision.</span>
        </h2>
        <p className="mt-5 text-base text-white/70 sm:text-lg">
          Skip one zomato order this week. Invest in the playbook that'll pay you back for life.
        </p>
        <button
          onClick={onCta}
          disabled={loading}
          className="btn-gold mt-8 inline-flex h-14 items-center justify-center gap-2 rounded-2xl px-7 text-base font-semibold"
        >
          {loading ? "Opening checkout..." : "Get My Copy Now"}
          {loading ? (
            <span className="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          ) : (
            <ArrowRight className="size-5" />
          )}
        </button>
        <div className="mt-5 text-xs text-white/55">Instant PDF · ₹99 · Lifetime access</div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-background px-5 py-8 md:px-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
        <div>© {new Date().getFullYear()} Money Playbook. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <a href="#" className="hover:text-foreground">Terms</a>
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Refunds</a>
        </div>
      </div>
    </footer>
  );
}

function StickyCta({ show, onCta, loading = false }: { show: boolean } & CtaButtonProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 md:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-primary p-2.5 pl-4 text-primary-foreground shadow-[0_20px_50px_-15px_rgba(0,0,0,0.45)]">
        <div className="leading-tight">
          <div className="text-[11px] text-white/55 line-through">₹299</div>
          <div className="text-base font-semibold">
            Get the ebook · <span className="text-gold">₹99</span>
          </div>
        </div>
        <button
          onClick={onCta}
          disabled={loading}
          className="btn-gold inline-flex h-12 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold"
        >
          {loading ? "Opening" : "Download"}
          {loading ? (
            <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}
