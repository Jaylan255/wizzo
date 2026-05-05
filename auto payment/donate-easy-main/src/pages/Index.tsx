import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Heart, Loader2, CheckCircle2, Clock } from "lucide-react";

type Status = "idle" | "submitting" | "pending" | "completed" | "failed";

const MIN_AMOUNT = 500;

function normalizePhoneClient(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(d)) return "255" + d.slice(1);
  if (/^255[67]\d{8}$/.test(d)) return d;
  return null;
}

const Index = () => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [donationId, setDonationId] = useState<string | null>(null);

  const presets = [1000, 5000, 10000, 50000];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fullName.trim().length < 2) return toast({ title: "Tafadhali andika jina kamili", variant: "destructive" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast({ title: "Email si sahihi", variant: "destructive" });
    if (!normalizePhoneClient(phone)) return toast({ title: "Namba ya simu si sahihi", description: "Tumia muundo 07XXXXXXXX", variant: "destructive" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < MIN_AMOUNT) return toast({ title: `Kiwango cha chini ni TZS ${MIN_AMOUNT.toLocaleString()}`, variant: "destructive" });

    setStatus("submitting");
    const { data, error } = await supabase.functions.invoke("donate", {
      body: { full_name: fullName, email, phone, amount: amt },
    });

    if (error || !data?.ok) {
      setStatus("idle");
      return toast({ title: "Imeshindikana", description: data?.error || error?.message || "Jaribu tena", variant: "destructive" });
    }
    setDonationId(data.donation_id);
    setStatus("pending");
    toast({ title: "Ombi limetumwa", description: "Angalia simu yako kwa USSD prompt." });
    pollStatus(data.donation_id);
  };

  const pollStatus = (id: string) => {
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      const { data: row } = await supabase.from("donations").select("status").eq("id", id).maybeSingle();
      if (row?.status === "COMPLETED") { setStatus("completed"); clearInterval(iv); }
      else if (row?.status && row.status !== "PENDING") { setStatus("failed"); clearInterval(iv); }
      if (attempts > 60) clearInterval(iv);
    }, 3000);
  };

  const reset = () => {
    setStatus("idle"); setDonationId(null);
    setFullName(""); setEmail(""); setPhone(""); setAmount("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <header className="relative overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
        <div className="relative max-w-3xl mx-auto px-6 pt-12 pb-20 text-primary-foreground">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-sm mb-6">
            <Heart className="w-4 h-4" /> Changia leo
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-3">
            Mchango wako unabadilisha maisha.
          </h1>
          <p className="text-lg opacity-90 max-w-xl">
            Tumia M-Pesa, Tigo Pesa au Airtel Money kuchangia kwa usalama. Kila shilingi inahesabika.
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 -mt-12 pb-16">
        <Card className="p-6 sm:p-8 shadow-2xl border-0" style={{ boxShadow: "var(--shadow-elegant)" }}>
          {status === "completed" ? (
            <div className="text-center py-8">
              <CheckCircle2 className="w-16 h-16 mx-auto text-primary mb-4" />
              <h2 className="text-2xl font-bold mb-2">Asante sana!</h2>
              <p className="text-muted-foreground mb-6">Mchango wako umepokelewa kwa mafanikio.</p>
              <Button onClick={reset}>Changia tena</Button>
            </div>
          ) : status === "pending" ? (
            <div className="text-center py-8">
              <Clock className="w-16 h-16 mx-auto text-primary mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold mb-2">Inasubiri uthibitisho</h2>
              <p className="text-muted-foreground mb-2">Angalia simu yako kuingiza PIN ya M-Pesa/Tigo/Airtel.</p>
              <p className="text-xs text-muted-foreground mb-6">Donation ID: {donationId?.slice(0, 8)}…</p>
              <Button variant="outline" onClick={reset}>Anza upya</Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold mb-1">Maelezo ya mchango</h2>
                <p className="text-sm text-muted-foreground">Sehemu zote zinahitajika.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Jina kamili</Label>
                <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Mfano: Asha Mwakyusa" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jina@mfano.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Simu</Label>
                  <Input id="phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXX" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Kiasi (TZS)</Label>
                <Input id="amount" type="number" min={MIN_AMOUNT} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Chini ya ${MIN_AMOUNT.toLocaleString()}`} />
                <div className="flex flex-wrap gap-2 pt-1">
                  {presets.map((p) => (
                    <button type="button" key={p} onClick={() => setAmount(String(p))}
                      className="px-3 py-1.5 rounded-full text-sm border border-border hover:bg-primary hover:text-primary-foreground transition">
                      TZS {p.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" className="w-full h-12 text-base" disabled={status === "submitting"}>
                {status === "submitting" ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Inatuma…</>
                ) : (
                  <><Heart className="w-4 h-4 mr-2" /> Changia sasa</>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Kwa kubonyeza Changia, unakubali masharti ya huduma.
              </p>
            </form>
          )}
        </Card>
      </main>
    </div>
  );
};

export default Index;
