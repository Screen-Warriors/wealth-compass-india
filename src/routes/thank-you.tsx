import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Lock, ShieldCheck } from "lucide-react";
import { getDownloadStatus } from "@/lib/ebook-payments.functions";

export const Route = createFileRoute("/thank-you")({
  validateSearch: (search) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({
    meta: [
      { title: "Payment Successful — Download Your Ebook" },
      { name: "description", content: "Secure download page for your personal finance ebook purchase." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ThankYouPage,
});

type DownloadState =
  | { status: "loading" }
  | { status: "ready"; productName: string; downloadPath: string; paidAt?: string | null }
  | { status: "invalid"; reason: string }
  | { status: "error"; message: string };

function ThankYouPage() {
  const { token } = Route.useSearch();
  const getStatus = useServerFn(getDownloadStatus);
  const [state, setState] = useState<DownloadState>({ status: "loading" });

  useEffect(() => {
    let mounted = true;

    if (!token) {
      setState({ status: "invalid", reason: "missing" });
      return;
    }

    getStatus({ data: { token } })
      .then((result) => {
        if (!mounted) return;
        if (!result.valid) {
          setState({ status: "invalid", reason: result.reason });
          return;
        }
        setState({
          status: "ready",
          productName: result.productName,
          downloadPath: result.downloadPath,
          paidAt: result.paidAt,
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not load your download link.",
        });
      });

    return () => {
      mounted = false;
    };
  }, [getStatus, token]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="relative overflow-hidden px-5 py-12 text-primary-foreground md:px-8 md:py-20" style={{ background: "var(--gradient-hero)" }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)", backgroundSize: "44px 44px" }} />
        <div className="relative mx-auto max-w-2xl text-center">
          {state.status === "ready" ? (
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-gold text-gold-foreground shadow-[0_20px_50px_-15px_rgba(217,159,55,0.6)]">
              <CheckCircle2 className="size-9" />
            </div>
          ) : (
            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-white/10 text-gold ring-1 ring-white/15">
              <Lock className="size-8" />
            </div>
          )}

          <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
            {state.status === "ready" ? "Payment Successful!" : "Verifying your access"}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/75 sm:text-lg">
            {state.status === "ready"
              ? "Payment Successful! Your ebook is ready for download."
              : "Please wait while we securely verify your purchase."}
          </p>
        </div>
      </section>

      <section className="px-5 py-12 md:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-6 text-center shadow-[0_24px_70px_-40px_rgba(0,0,0,0.35)] sm:p-8">
          {state.status === "loading" && (
            <div>
              <div className="mx-auto size-10 animate-spin rounded-full border-2 border-muted border-t-gold" />
              <p className="mt-4 text-sm text-muted-foreground">Preparing your secure download...</p>
            </div>
          )}

          {state.status === "ready" && (
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
                <ShieldCheck className="size-4" /> Verified purchase
              </div>
              <h2 className="mt-5 text-2xl font-semibold text-primary">{state.productName}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your private download link is active for 7 days. Keep this page safe.
              </p>
              <a href={state.downloadPath} className="btn-gold mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-base font-semibold sm:w-auto">
                <Download className="size-5" /> Secure Download Ebook
              </a>
              <p className="mt-4 text-xs text-muted-foreground">
                If you entered an email during checkout, your payment is saved under that email.
              </p>
            </div>
          )}

          {state.status === "invalid" && (
            <DownloadIssue
              title={state.reason === "expired" ? "Download link expired" : "Download link not found"}
              message="This secure link is invalid or no longer active. If payment was debited, contact support with your Razorpay payment ID."
            />
          )}

          {state.status === "error" && <DownloadIssue title="Could not load download" message={state.message} />}

          <Link to="/" className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft className="size-4" /> Back to landing page
          </Link>
        </div>
      </section>
    </main>
  );
}

function DownloadIssue({ title, message }: { title: string; message: string }) {
  return (
    <div>
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-primary">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}