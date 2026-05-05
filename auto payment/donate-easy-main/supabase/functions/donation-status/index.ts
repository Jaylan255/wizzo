import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return new Response(JSON.stringify({ error: "id required" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await supabase.from("donations")
    .select("id,status,amount,created_at").eq("id", id).maybeSingle();

  return new Response(JSON.stringify({ donation: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
