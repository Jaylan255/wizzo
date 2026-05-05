// Mongike webhook receiver — payload: { order_id, payment_status, reference, amount, metadata }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  const raw = await req.text();
  let payload: Record<string, any> = {};
  try { payload = JSON.parse(raw); } catch { /* keep empty */ }

  await supabase.from("webhook_logs").insert({ headers, payload });

  // Verify x-api-key (Mongike sends our own API key back — same MONGIKE_API_KEY)
  const expected = Deno.env.get("MONGIKE_WEBHOOK_API_KEY") || Deno.env.get("MONGIKE_API_KEY") || "";
  const provided = req.headers.get("x-api-key") ?? "";
  if (!expected || !timingSafeEqual(expected, provided)) {
    console.warn("Invalid webhook x-api-key");
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const orderId = String(payload.order_id ?? "");
  const paymentStatus = String(payload.payment_status ?? "").toUpperCase();
  const reference = payload.reference ? String(payload.reference) : null;

  if (!orderId) {
    console.warn("Webhook missing order_id");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // order_id == our donation.id
  const updates: Record<string, unknown> = {
    status: paymentStatus || "COMPLETED",
    webhook_payload: payload,
  };
  if (reference) updates.gateway_ref = reference;

  const { error } = await supabase.from("donations").update(updates).eq("id", orderId);
  if (error) console.error("Update donation failed", error);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
