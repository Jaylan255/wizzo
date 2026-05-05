// Public donation initiation function — Mongike Mobile Money Tanzania
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MONGIKE_BASE_URL = "https://mongike.com/api/v1";

function resolveMongikeEndpoint(): string {
  const configured = Deno.env.get("MONGIKE_BASE_URL")?.trim();
  const safeConfigured = configured && /^https?:\/\//i.test(configured) ? configured : "";
  if (configured && !safeConfigured) {
    console.warn("MONGIKE_BASE_URL is not a valid URL; using the default Mongike endpoint");
  }
  const baseOrEndpoint = (safeConfigured || DEFAULT_MONGIKE_BASE_URL).replace(/\/+$/, "");
  if (/\/payments\/mobile-money\/tanzania$/i.test(baseOrEndpoint)) return baseOrEndpoint;
  if (/\/api\/v1$/i.test(baseOrEndpoint)) return `${baseOrEndpoint}/payments/mobile-money/tanzania`;
  return `${baseOrEndpoint}/api/v1/payments/mobile-money/tanzania`;
}

function resolveFeePayer(): "MERCHANT" | "CUSTOMER" {
  const configured = Deno.env.get("MONGIKE_FEE_PAYER")?.trim().toUpperCase();
  return configured === "CUSTOMER" ? "CUSTOMER" : "MERCHANT";
}

function normalizeTzPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return "255" + digits.slice(1);
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  if (/^\+255[67]\d{8}$/.test(raw)) return digits;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { full_name, email, phone, amount } = body ?? {};

    const configuredMinAmount = Number(Deno.env.get("MIN_DONATION_TZS") ?? "500");
    const minAmount = Number.isFinite(configuredMinAmount) && configuredMinAmount > 0
      ? Math.min(configuredMinAmount, 500)
      : 500;

    if (!full_name || typeof full_name !== "string" || full_name.trim().length < 2)
      return json({ error: "Jina kamili linahitajika" }, 400);
    if (!email || !/^\S+@\S+\.\S+$/.test(email))
      return json({ error: "Email si sahihi" }, 400);
    const normPhone = normalizeTzPhone(String(phone ?? ""));
    if (!normPhone) return json({ error: "Namba ya simu si sahihi (tumia 07XXXXXXXX)" }, 400);
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < minAmount)
      return json({ error: `Kiwango cha chini ni TZS ${minAmount}` }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Create donation; we use donation.id as Mongike order_id
    const { data: donation, error: insertErr } = await supabase
      .from("donations")
      .insert({
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        phone: normPhone,
        amount: amt,
        status: "PENDING",
      })
      .select()
      .single();

    if (insertErr || !donation) {
      console.error("Insert error", insertErr);
      return json({ error: "Imeshindikana kuhifadhi mchango" }, 500);
    }

    const apiKey = Deno.env.get("MONGIKE_API_KEY");
    if (!apiKey) {
      console.warn("MONGIKE_API_KEY missing — donation stored as PENDING only");
      return json({ ok: true, donation_id: donation.id, status: "PENDING", message: "Mongike haijawekwa" });
    }

    const projectUrl = Deno.env.get("SUPABASE_URL")!;
    const configuredWebhook = Deno.env.get("MONGIKE_WEBHOOK_URL")?.trim();
    const includeWebhook = (Deno.env.get("MONGIKE_INCLUDE_WEBHOOK_URL") ?? "true").toLowerCase() !== "false";
    const webhookUrl = configuredWebhook || `${projectUrl}/functions/v1/mongike-webhook`;

    const payload: Record<string, unknown> = {
      order_id: donation.id,
      amount: amt,
      buyer_phone: normPhone,
      buyer_name: full_name.trim(),
      buyer_email: email.trim().toLowerCase(),
      fee_payer: resolveFeePayer(),
      metadata: { source: "lovable-donation-page" },
    };
    if (includeWebhook) payload.webhook_url = webhookUrl;

    let gatewayMessage = "Ombi limeanzishwa";
    try {
      const resp = await fetch(resolveMongikeEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify(payload),
      });
      const data = await resp.json().catch(() => ({}));
      console.log("Mongike response", resp.status, JSON.stringify(data));

      if (!resp.ok) {
        return json({ error: data?.message || `Mongike ilikataa ombi (${resp.status})` }, 400);
      }

      const reference = data?.data?.gateway_ref ?? data?.gateway_ref ?? data?.data?.reference ?? data?.reference ?? null;
      gatewayMessage = data?.message ?? gatewayMessage;

      if (reference) {
        await supabase.from("donations").update({ gateway_ref: reference }).eq("id", donation.id);
      }
    } catch (e) {
      console.error("Mongike call failed", e);
      return json({ error: "Imeshindikana kuwasiliana na Mongike" }, 502);
    }

    return json({
      ok: true,
      donation_id: donation.id,
      status: "PENDING",
      message: gatewayMessage,
    });
  } catch (e) {
    console.error("donate error", e);
    return json({ error: "Hitilafu ya seva" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
