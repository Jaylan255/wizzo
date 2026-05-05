import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLAN_CONFIG: Record<string, { amount: number; days: number; label: string }> = {
  "2_hours": { amount: 500, days: 2 / 24, label: "2 Hours" },
  "6_hours": { amount: 1000, days: 6 / 24, label: "6 Hours" },
  "1_day": { amount: 2000, days: 1, label: "1 Day" },
  "1_week": { amount: 3000, days: 7, label: "1 Week" },
  "week": { amount: 3000, days: 7, label: "Week" },
  "2_weeks": { amount: 5000, days: 14, label: "2 Weeks" },
  "2_week": { amount: 5000, days: 14, label: "2 Weeks" },
  "1_month": { amount: 9000, days: 30, label: "1 Month" },
  "month": { amount: 9000, days: 30, label: "Month" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const donationId = String(body?.donation_id ?? "").trim();
    const userId = String(body?.user_id ?? "").trim();
    const selectedPlan = String(body?.selected_plan ?? "").trim();
    const phone = String(body?.phone ?? "").replace(/\D/g, "");
    const amount = Number(body?.amount ?? 0);
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!donationId || !userId || !selectedPlan || !phone || !email) {
      return json({ error: "donation_id, user_id, selected_plan, phone and email are required" }, 400);
    }

    const plan = PLAN_CONFIG[selectedPlan];
    if (!plan) return json({ error: "Invalid plan selected" }, 400);
    if (amount !== plan.amount) return json({ error: "Plan amount does not match the selected plan" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: donation, error: donationError } = await supabase
      .from("donations")
      .select("id,status,amount,email,phone")
      .eq("id", donationId)
      .maybeSingle();

    if (donationError || !donation) {
      return json({ error: "Payment record not found" }, 404);
    }

    if (String(donation.status ?? "").toUpperCase() !== "COMPLETED") {
      return json({ error: "Payment is not completed yet" }, 409);
    }

    if (Number(donation.amount) !== plan.amount) {
      return json({ error: "Paid amount does not match the selected plan" }, 409);
    }

    const normalizedDonationPhone = String(donation.phone ?? "").replace(/\D/g, "");
    if (normalizedDonationPhone !== phone) {
      return json({ error: "Phone number does not match the verified payment" }, 409);
    }

    if (String(donation.email ?? "").trim().toLowerCase() !== email) {
      return json({ error: "Email does not match the verified payment" }, 409);
    }

    const now = new Date();
    const expiry = new Date(now.getTime() + (plan.days * 24 * 60 * 60 * 1000));

    const { error: paymentError } = await supabase
      .from("subscription_payments")
      .upsert({
        donation_id: donationId,
        user_id: userId,
        plan: selectedPlan,
        amount: plan.amount,
        phone,
        payment_status: "COMPLETED",
        paid_at: now.toISOString(),
      }, { onConflict: "donation_id" });

    if (paymentError) {
      console.error("subscription_payments upsert failed", paymentError);
      return json({ error: "Failed to record subscription payment" }, 500);
    }

    const { error: subscriptionError } = await supabase
      .from("user_subscriptions")
      .upsert({
        user_id: userId,
        status: "paid",
        plan: selectedPlan,
        amount: plan.amount,
        phone,
        days_assigned: plan.days,
        start_date: now.toISOString(),
        expiry_date: expiry.toISOString(),
        last_payment_id: donationId,
      }, { onConflict: "user_id" });

    if (subscriptionError) {
      console.error("user_subscriptions upsert failed", subscriptionError);
      return json({ error: "Failed to activate subscription" }, 500);
    }

    return json({
      ok: true,
      subscription: {
        user_id: userId,
        status: "paid",
        plan: selectedPlan,
        plan_label: plan.label,
        amount: plan.amount,
        days_remaining: plan.days,
        start_date: now.toISOString(),
        expiry_date: expiry.toISOString(),
      }
    });
  } catch (error) {
    console.error("activate-subscription error", error);
    return json({ error: "Server error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
