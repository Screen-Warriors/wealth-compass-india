CREATE TABLE public.ebook_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt TEXT NOT NULL UNIQUE,
  product_name TEXT NOT NULL DEFAULT 'Personal Finance for Gen Z & Millennials',
  amount_paise INTEGER NOT NULL DEFAULT 9900,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  razorpay_signature TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  checkout_source TEXT,
  failure_reason TEXT,
  download_token TEXT UNIQUE,
  download_token_expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.ebook_orders TO service_role;
ALTER TABLE public.ebook_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server code can manage ebook orders"
ON public.ebook_orders
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TABLE public.ebook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL CHECK (event_name IN ('ViewContent', 'InitiateCheckout', 'Purchase', 'PaymentFailed')),
  source TEXT,
  amount_paise INTEGER,
  currency TEXT DEFAULT 'INR',
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  user_agent TEXT,
  referrer TEXT,
  landing_path TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.ebook_events TO anon;
GRANT ALL ON public.ebook_events TO service_role;
ALTER TABLE public.ebook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors can add ebook funnel events"
ON public.ebook_events
FOR INSERT
TO anon
WITH CHECK (event_name IN ('ViewContent', 'InitiateCheckout', 'Purchase', 'PaymentFailed'));
CREATE POLICY "Trusted server code can manage ebook events"
ON public.ebook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE INDEX ebook_orders_razorpay_order_id_idx ON public.ebook_orders (razorpay_order_id);
CREATE INDEX ebook_orders_download_token_idx ON public.ebook_orders (download_token);
CREATE INDEX ebook_events_event_name_created_at_idx ON public.ebook_events (event_name, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_ebook_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ebook_orders_updated_at
BEFORE UPDATE ON public.ebook_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_ebook_orders_updated_at();