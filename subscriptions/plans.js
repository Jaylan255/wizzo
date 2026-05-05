import {
  PLAN_MAP,
  activateSubscription,
  createPaymentRequest,
  fetchSubscriptionStatus,
  formatCurrency,
  getDonationStatus,
  normalizePhone,
  requireCurrentUser,
  syncSubscriptionToFirebase,
} from "./subscription-client.js";

const planGrid = document.getElementById("plan-grid");
const payForm = document.getElementById("pay-form");
const selectedPlanName = document.getElementById("selected-plan-name");
const selectedPlanDays = document.getElementById("selected-plan-days");
const amountInput = document.getElementById("amount");
const phoneInput = document.getElementById("phone");
const messageEl = document.getElementById("payment-message");
const statusSummary = document.getElementById("subscription-summary");
const submitBtn = document.getElementById("submit-payment");

let selectedPlanKey = "2_hours";
let currentUserBundle = null;

function setMessage(text, type = "") {
  messageEl.textContent = text;
  messageEl.className = `message ${type}`.trim();
}

function renderPlans() {
  planGrid.innerHTML = Object.entries(PLAN_MAP).map(([key, plan]) => `
    <article class="card plan-card ${key === selectedPlanKey ? "active" : ""}" data-plan="${key}">
      <div class="plan-top">
        <div>
          <div class="badge">Premium</div>
          <h2>${plan.label}</h2>
        </div>
        <div class="price">${formatCurrency(plan.amount)}</div>
      </div>
      <div class="plan-meta">
        <div><span class="muted">Duration</span><strong>${plan.days} day${plan.days > 1 ? "s" : ""}</strong></div>
        <div><span class="muted">Status</span><strong>Paid plan</strong></div>
      </div>
      <button class="primary" type="button" data-pick="${key}">Pay</button>
    </article>
  `).join("");
}

function updateSelectedPlan(planKey) {
  selectedPlanKey = planKey;
  const plan = PLAN_MAP[planKey];
  selectedPlanName.textContent = plan.label;
  selectedPlanDays.textContent = `${plan.days} day${plan.days > 1 ? "s" : ""}`;
  amountInput.value = String(plan.amount);
  renderPlans();
}

function renderSubscriptionSummary(subscription) {
  if (!subscription) {
    statusSummary.innerHTML = `
      <div class="status-row"><span class="muted">Status</span><span class="status-pill unpaid">Unpaid</span></div>
      <div class="status-row"><span class="muted">Plan</span><strong>None</strong></div>
      <div class="status-row"><span class="muted">Days Remaining</span><strong>0</strong></div>
    `;
    return;
  }

  const isPaid = String(subscription.status || "").toLowerCase() === "paid";
  statusSummary.innerHTML = `
    <div class="status-row"><span class="muted">Status</span><span class="status-pill ${isPaid ? "paid" : "unpaid"}">${isPaid ? "Paid" : "Unpaid"}</span></div>
    <div class="status-row"><span class="muted">Plan</span><strong>${subscription.plan_label || "None"}</strong></div>
    <div class="status-row"><span class="muted">Days Remaining</span><strong>${Number(subscription.days_remaining || 0)}</strong></div>
  `;
}

async function loadCurrentSubscription() {
  const result = await fetchSubscriptionStatus(currentUserBundle.authUser.uid);
  renderSubscriptionSummary(result.subscription);
  await syncSubscriptionToFirebase(currentUserBundle.authUser.uid, result.subscription);
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  const plan = PLAN_MAP[selectedPlanKey];
  const rawPhone = phoneInput.value.trim();
  const normalizedPhone = normalizePhone(rawPhone);
  if (!normalizedPhone) {
    setMessage("Enter a valid Tanzania phone number starting with 06 or 07.", "error");
    return;
  }

  submitBtn.disabled = true;
  setMessage("Waiting for payment confirmation...", "warning");

  try {
    const email = String(currentUserBundle.profile?.email || currentUserBundle.authUser.email || "").trim().toLowerCase();
    const fullName = String(currentUserBundle.profile?.displayName || currentUserBundle.profile?.username || currentUserBundle.authUser.phoneNumber || email || "SwaMedia User");

    const paymentResult = await createPaymentRequest({
      fullName,
      email,
      phone: normalizedPhone,
      amount: plan.amount,
      selectedPlan: selectedPlanKey,
      userId: currentUserBundle.authUser.uid,
    });

    const donationId = paymentResult?.donation_id;
    if (!donationId) {
      throw new Error("Payment request started without a donation id.");
    }

    let attempts = 0;
    const poller = setInterval(async () => {
      attempts += 1;
      try {
        const statusResult = await getDonationStatus(donationId);
        const paymentStatus = String(statusResult?.donation?.status || "").toUpperCase();

        if (paymentStatus === "COMPLETED") {
          clearInterval(poller);
          const activationResult = await activateSubscription({
            donationId,
            userId: currentUserBundle.authUser.uid,
            selectedPlan: selectedPlanKey,
            phone: normalizedPhone,
            amount: plan.amount,
            email,
          });
          await syncSubscriptionToFirebase(currentUserBundle.authUser.uid, activationResult.subscription);
          setMessage("Payment successful", "success");
          renderSubscriptionSummary(activationResult.subscription);
          setTimeout(() => {
            window.location.href = "/dashboard";
          }, 1200);
          return;
        }

        if (paymentStatus && paymentStatus !== "PENDING") {
          clearInterval(poller);
          submitBtn.disabled = false;
          setMessage("Payment failed", "error");
          return;
        }

        if (attempts >= 40) {
          clearInterval(poller);
          submitBtn.disabled = false;
          setMessage("Still waiting for payment confirmation. Complete the USSD prompt on your phone, then try again.", "warning");
        }
      } catch (error) {
        clearInterval(poller);
        submitBtn.disabled = false;
        setMessage(error.message || "Failed to verify payment.", "error");
      }
    }, 3000);
  } catch (error) {
    submitBtn.disabled = false;
    setMessage(error.message || "Failed to start payment.", "error");
  }
}

async function init() {
  renderPlans();
  updateSelectedPlan(selectedPlanKey);

  try {
    currentUserBundle = await requireCurrentUser();
    if (!String(currentUserBundle.profile?.email || currentUserBundle.authUser.email || "").trim()) {
      setMessage("Your account needs an email before payment can start. Update your profile, then try again.", "error");
      submitBtn.disabled = true;
      return;
    }
    await loadCurrentSubscription();
  } catch (error) {
    setMessage(error.message, "error");
    submitBtn.disabled = true;
  }

  planGrid.addEventListener("click", (event) => {
    const target = event.target.closest("[data-pick]");
    if (!target) return;
    updateSelectedPlan(target.dataset.pick);
    document.getElementById("payment-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  payForm.addEventListener("submit", handlePaymentSubmit);
}

init();
