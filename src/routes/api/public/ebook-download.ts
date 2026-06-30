import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const tokenSchema = z.string().trim().min(32).max(128).regex(/^[a-f0-9]+$/i);

export const Route = createFileRoute("/api/public/ebook-download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestUrl = new URL(request.url);
        const parsedToken = tokenSchema.safeParse(requestUrl.searchParams.get("token") ?? "");

        if (!parsedToken.success) {
          return new Response("Invalid download token.", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order, error } = await supabaseAdmin
          .from("ebook_orders")
          .select("status, download_token_expires_at")
          .eq("download_token", parsedToken.data)
          .maybeSingle();

        if (error) {
          console.error("Download token lookup failed", error);
          return new Response("Could not verify download access.", { status: 500 });
        }

        if (!order || order.status !== "paid") {
          return new Response("Download access denied.", { status: 403 });
        }

        if (order.download_token_expires_at && new Date(order.download_token_expires_at).getTime() < Date.now()) {
          return new Response("Download link expired.", { status: 410 });
        }

        const ebookUrl = process.env.EBOOK_DOWNLOAD_URL;
        if (!ebookUrl) {
          return new Response("Ebook download is not configured.", { status: 500 });
        }

        const ebookResponse = await fetch(ebookUrl);
        if (!ebookResponse.ok || !ebookResponse.body) {
          return new Response("Ebook file is temporarily unavailable.", { status: 502 });
        }

        const headers = new Headers();
        headers.set("Content-Type", ebookResponse.headers.get("Content-Type") || "application/pdf");
        headers.set("Content-Disposition", 'attachment; filename="personal-finance-gen-z-millennials.pdf"');
        headers.set("Cache-Control", "private, no-store, max-age=0");
        headers.set("X-Content-Type-Options", "nosniff");

        return new Response(ebookResponse.body, { status: 200, headers });
      },
    },
  },
});