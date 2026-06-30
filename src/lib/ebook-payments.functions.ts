import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

const PRODUCT_NAME = "Personal Finance for Gen Z & Millennials";
const PRODUCT_DESCRIPTION = "Digital PDF Ebook";
const PRODUCT_AMOUNT_PAISE = 9900;
const PRODUCT_PRICE = 99;
const PRODUCT_CURRENCY = "INR";

const eventSchema = z.object({
  eventName: z.enum(["ViewContent", "InitiateCheckout", "Purchase", "PaymentFailed"]),
  source: z.string().trim().max(80).optional(),
  amountPaise: z.number().int().nonnegative().optional(),
  currency: z.literal("INR").optional(),
  razorpayOrderId: z.string().trim().max(120).optional(),
  razorpayPaymentId: z.string().trim().max(120).optional(),
  referrer: z.string().trim().max(500).optional(),
  landingPath: z.string().trim().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const createOrderSchema = z.object({
  source: z.string().trim().max(80).optional(),
  customerName: z.string().trim().max(120).optional(),
  customerEmail: z.string().trim().email().max(180).optional(),
  customerPhone: z.string().trim().max(30).optional(),
  referrer: z.string().trim().max(500).optional(),
  landingPath: z.string().trim().max(500).optional(),
});

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().trim().min(3).max(120),
  razorpay_payment_id: z.string().trim().min(3).max(120),
  razorpay_signature: z.string().trim().min(32).max(256),
  source: z.string().trim().max(80).optional(),
});

const failedPaymentSchema = z.object({
  razorpayOrderId: z.string().trim().max(120).optional(),
  razorpayPaymentId: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(500).optional(),
  source: z.string().trim().max(80).optional(),
});

const downloadStatusSchema = z.object({
  token: z.string().trim().min(32).max(128).regex(/^[a-f0-9]+$/i),
});

type RazorpayOrderResponse = {
  id: string;
  entity: string;
  amount: number;
  amount_paid: number;
  amount_due: number;
  currency: string;
  receipt: string;
  status: string;
};

type RazorpayPaymentResponse = {
  id: string;
  order_id?: string | null;
  amount?: number | null;
  currency?: string | null;
  method?: string;
  email?: string | null;
  contact?: string | null;
  status?: string;
  captured?: boolean;
  error_description?: string | null;
};

const jsonHeaders = { "Content-Type": "application/json" };

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function randomHex(byteLength: number) {
  const values = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  const cleanHex = hex.toLowerCase();
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(cleanHex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right) || left.length !== right.length) {
    return false;
  }

  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

function bufferToHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function createSignature(payload: string, secret: string) {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return bufferToHex(signature);
}

function toJson(value: Record<string, unknown> | undefined): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

async function razorpayAuthHeader() {
  const keyId = requireEnv("RAZORPAY_KEY_ID");
  const secretKey = requireEnv("RAZORPAY_SECRET_KEY");
  return `Basic ${btoa(`${keyId}:${secretKey}`)}`;
}

async function razorpayRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: await razorpayAuthHeader(),
      ...jsonHeaders,
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { description?: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.description || "Razorpay request failed.");
  }

  return payload;
}

async function insertEvent(data: z.infer<typeof eventSchema>) {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("ebook_events").insert({
    event_name: data.eventName,
    source: data.source ?? null,
    amount_paise: data.amountPaise ?? null,
    currency: data.currency ?? PRODUCT_CURRENCY,
    razorpay_order_id: data.razorpayOrderId ?? null,
    razorpay_payment_id: data.razorpayPaymentId ?? null,
    user_agent: getRequestHeader("user-agent") ?? null,
    referrer: data.referrer ?? null,
    landing_path: data.landingPath ?? null,
    metadata: toJson(data.metadata),
  });

  if (error) console.error("Failed to store ebook analytics event", error);
}

export const getCheckoutConfig = createServerFn({ method: "GET" }).handler(async () => ({
  productName: PRODUCT_NAME,
  productDescription: PRODUCT_DESCRIPTION,
  amountPaise: PRODUCT_AMOUNT_PAISE,
  price: PRODUCT_PRICE,
  currency: PRODUCT_CURRENCY,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? "",
  metaPixelId: process.env.META_PIXEL_ID ?? "",
}));

export const trackEbookEvent = createServerFn({ method: "POST" })
  .inputValidator((data) => eventSchema.parse(data))
  .handler(async ({ data }) => {
    await insertEvent(data);
    return { ok: true };
  });

export const createEbookOrder = createServerFn({ method: "POST" })
  .inputValidator((data) => createOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const keyId = requireEnv("RAZORPAY_KEY_ID");
    requireEnv("RAZORPAY_SECRET_KEY");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const receipt = `ebook_${Date.now()}_${globalThis.crypto.randomUUID().slice(0, 8)}`;

    const { error: insertError } = await supabaseAdmin.from("ebook_orders").insert({
      receipt,
      product_name: PRODUCT_NAME,
      amount_paise: PRODUCT_AMOUNT_PAISE,
      currency: PRODUCT_CURRENCY,
      status: "created",
      customer_name: data.customerName ?? null,
      customer_email: data.customerEmail ?? null,
      customer_phone: data.customerPhone ?? null,
      checkout_source: data.source ?? "landing",
    });

    if (insertError) {
      console.error("Failed to create local ebook order", insertError);
      throw new Error("Could not start checkout. Please try again.");
    }

    try {
      const razorpayOrder = await razorpayRequest<RazorpayOrderResponse>("/orders", {
        method: "POST",
        body: JSON.stringify({
          amount: PRODUCT_AMOUNT_PAISE,
          currency: PRODUCT_CURRENCY,
          receipt,
          notes: {
            product_name: PRODUCT_NAME,
            product_type: PRODUCT_DESCRIPTION,
            source: data.source ?? "landing",
          },
        }),
      });

      const { error: updateError } = await supabaseAdmin
        .from("ebook_orders")
        .update({ razorpay_order_id: razorpayOrder.id })
        .eq("receipt", receipt);

      if (updateError) {
        console.error("Failed to attach Razorpay order id", updateError);
        throw new Error("Could not prepare secure checkout. Please try again.");
      }

      await insertEvent({
        eventName: "InitiateCheckout",
        source: data.source ?? "landing",
        amountPaise: PRODUCT_AMOUNT_PAISE,
        currency: PRODUCT_CURRENCY,
        razorpayOrderId: razorpayOrder.id,
        referrer: data.referrer,
        landingPath: data.landingPath,
      });

      return {
        keyId,
        productName: PRODUCT_NAME,
        productDescription: PRODUCT_DESCRIPTION,
        amountPaise: PRODUCT_AMOUNT_PAISE,
        currency: PRODUCT_CURRENCY,
        razorpayOrderId: razorpayOrder.id,
        receipt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Razorpay checkout failed.";
      await supabaseAdmin
        .from("ebook_orders")
        .update({ status: "failed", failure_reason: message })
        .eq("receipt", receipt);
      throw new Error(message);
    }
  });

export const verifyEbookPayment = createServerFn({ method: "POST" })
  .inputValidator((data) => verifyPaymentSchema.parse(data))
  .handler(async ({ data }) => {
    const secretKey = requireEnv("RAZORPAY_SECRET_KEY");
    const expectedSignature = await createSignature(
      `${data.razorpay_order_id}|${data.razorpay_payment_id}`,
      secretKey,
    );

    const isValid = safeEqualHex(data.razorpay_signature, expectedSignature);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!isValid) {
      await supabaseAdmin
        .from("ebook_orders")
        .update({
          status: "failed",
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          failure_reason: "Payment signature verification failed.",
        })
        .eq("razorpay_order_id", data.razorpay_order_id);

      await insertEvent({
        eventName: "PaymentFailed",
        source: data.source,
        amountPaise: PRODUCT_AMOUNT_PAISE,
        currency: PRODUCT_CURRENCY,
        razorpayOrderId: data.razorpay_order_id,
        razorpayPaymentId: data.razorpay_payment_id,
        metadata: { reason: "signature_verification_failed" },
      });

      throw new Error("Payment verification failed. Please contact support if money was debited.");
    }

    const { data: existingOrder, error: orderLookupError } = await supabaseAdmin
      .from("ebook_orders")
      .select("status, download_token, amount_paise")
      .eq("razorpay_order_id", data.razorpay_order_id)
      .maybeSingle();

    if (orderLookupError) {
      console.error("Failed to lookup ebook order before verification", orderLookupError);
      throw new Error("Payment could not be matched to an order. Please contact support.");
    }

    if (!existingOrder || existingOrder.amount_paise !== PRODUCT_AMOUNT_PAISE) {
      throw new Error("Payment could not be matched to a valid ebook order. Please contact support.");
    }

    if (existingOrder.status === "paid" && existingOrder.download_token) {
      return {
        success: true,
        downloadToken: existingOrder.download_token,
        redirectPath: `/thank-you?token=${encodeURIComponent(existingOrder.download_token)}`,
      };
    }

    let payment = await razorpayRequest<RazorpayPaymentResponse>(
      `/payments/${encodeURIComponent(data.razorpay_payment_id)}`,
      { method: "GET" },
    );

    if (payment.status === "authorized") {
      payment = await razorpayRequest<RazorpayPaymentResponse>(
        `/payments/${encodeURIComponent(data.razorpay_payment_id)}/capture`,
        {
          method: "POST",
          body: JSON.stringify({ amount: PRODUCT_AMOUNT_PAISE, currency: PRODUCT_CURRENCY }),
        },
      );
    }

    const paymentIsValid =
      payment.order_id === data.razorpay_order_id &&
      payment.amount === PRODUCT_AMOUNT_PAISE &&
      payment.currency === PRODUCT_CURRENCY &&
      payment.status === "captured";

    if (!paymentIsValid) {
      await supabaseAdmin
        .from("ebook_orders")
        .update({
          status: "failed",
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature,
          failure_reason: "Razorpay payment details did not match the order.",
        })
        .eq("razorpay_order_id", data.razorpay_order_id);

      await insertEvent({
        eventName: "PaymentFailed",
        source: data.source,
        amountPaise: PRODUCT_AMOUNT_PAISE,
        currency: PRODUCT_CURRENCY,
        razorpayOrderId: data.razorpay_order_id,
        razorpayPaymentId: data.razorpay_payment_id,
        metadata: {
          reason: "payment_detail_mismatch",
          payment_status: payment.status ?? null,
        },
      });

      throw new Error("Payment could not be confirmed securely. Please contact support if money was debited.");
    }

    const downloadToken = randomHex(32);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from("ebook_orders")
      .update({
        status: "paid",
        razorpay_payment_id: data.razorpay_payment_id,
        razorpay_signature: data.razorpay_signature,
        customer_email: payment.email ?? undefined,
        customer_phone: payment.contact ?? undefined,
        download_token: downloadToken,
        download_token_expires_at: expiresAt,
        paid_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq("razorpay_order_id", data.razorpay_order_id)
      .eq("amount_paise", PRODUCT_AMOUNT_PAISE)
      .select("id, receipt")
      .maybeSingle();

    if (updateError || !updatedOrder) {
      console.error("Failed to mark ebook order as paid", updateError);
      throw new Error("Payment captured, but access could not be generated. Please contact support.");
    }

    await insertEvent({
      eventName: "Purchase",
      source: data.source,
      amountPaise: PRODUCT_AMOUNT_PAISE,
      currency: PRODUCT_CURRENCY,
      razorpayOrderId: data.razorpay_order_id,
      razorpayPaymentId: data.razorpay_payment_id,
      metadata: {
        payment_method: payment.method ?? null,
        payment_status: payment.status ?? null,
      },
    });

    return {
      success: true,
      downloadToken,
      redirectPath: `/thank-you?token=${encodeURIComponent(downloadToken)}`,
    };
  });

export const markEbookPaymentFailed = createServerFn({ method: "POST" })
  .inputValidator((data) => failedPaymentSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.razorpayOrderId) {
      await supabaseAdmin
        .from("ebook_orders")
        .update({
          status: "failed",
          razorpay_payment_id: data.razorpayPaymentId ?? null,
          failure_reason: data.reason ?? "Payment failed or was cancelled.",
        })
        .eq("razorpay_order_id", data.razorpayOrderId);
    }

    await insertEvent({
      eventName: "PaymentFailed",
      source: data.source,
      amountPaise: PRODUCT_AMOUNT_PAISE,
      currency: PRODUCT_CURRENCY,
      razorpayOrderId: data.razorpayOrderId,
      razorpayPaymentId: data.razorpayPaymentId,
      metadata: { reason: data.reason ?? "payment_failed" },
    });

    return { ok: true };
  });

export const getEbookAnalytics = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: events, error } = await supabaseAdmin
    .from("ebook_events")
    .select("event_name, amount_paise");

  if (error) {
    console.error("Failed to load ebook analytics", error);
    throw new Error("Could not load ebook analytics.");
  }

  const visits = events.filter((event) => event.event_name === "ViewContent").length;
  const checkoutStarts = events.filter((event) => event.event_name === "InitiateCheckout").length;
  const purchases = events.filter((event) => event.event_name === "Purchase");
  const revenuePaise = purchases.reduce((total, event) => total + (event.amount_paise ?? 0), 0);

  return {
    visits,
    checkoutStarts,
    successfulPurchases: purchases.length,
    conversionRate: visits > 0 ? purchases.length / visits : 0,
    revenuePaise,
    revenue: revenuePaise / 100,
    currency: PRODUCT_CURRENCY,
  };
});

export const getDownloadStatus = createServerFn({ method: "POST" })
  .inputValidator((data) => downloadStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("ebook_orders")
      .select("status, product_name, amount_paise, currency, paid_at, download_token_expires_at")
      .eq("download_token", data.token)
      .maybeSingle();

    if (error) {
      console.error("Failed to verify download token", error);
      throw new Error("Could not verify download access.");
    }

    if (!order || order.status !== "paid") {
      return { valid: false, reason: "not_found" as const };
    }

    if (order.download_token_expires_at && new Date(order.download_token_expires_at).getTime() < Date.now()) {
      return { valid: false, reason: "expired" as const };
    }

    return {
      valid: true,
      productName: order.product_name,
      amount: order.amount_paise / 100,
      currency: order.currency,
      paidAt: order.paid_at,
      downloadPath: `/api/public/ebook-download?token=${encodeURIComponent(data.token)}`,
    };
  });