import {
  fetchSubscriptionStatus,
  requireCurrentUser,
  syncSubscriptionToFirebase,
} from "./subscription-client.js";

const accountInfo = document.getElementById("account-info");
const subscriptionInfo = document.getElementById("subscription-info");
const accessNotice = document.getElementById("access-notice");

function renderStatus(subscription) {
  const isPaid = String(subscription?.status || "").toLowerCase() === "paid";
  const planLabel = subscription?.plan_label || "None";
  const daysRemaining = Number(subscription?.days_remaining || 0);
  const expiryDate = subscription?.expiry_date
    ? new Date(subscription.expiry_date).toLocaleString()
    : "Not active";

  subscriptionInfo.innerHTML = `
    <div class="status-row"><span class="muted">Status</span><span class="status-pill ${isPaid ? "paid" : "unpaid"}">${isPaid ? "Paid" : "Unpaid"}</span></div>
    <div class="status-row"><span class="muted">Plan</span><strong>${planLabel}</strong></div>
    <div class="status-row"><span class="muted">Days Remaining</span><strong>${daysRemaining}</strong></div>
    <div class="status-row"><span class="muted">Expires</span><strong>${expiryDate}</strong></div>
  `;

  accessNotice.innerHTML = isPaid
    ? "Premium access is active. Protected parts of the app should remain unlocked while your subscription is valid."
    : "Status: Unpaid. Days: 0. Upgrade on the plans page to restore premium access.";
}

async function init() {
  try {
    const currentUserBundle = await requireCurrentUser();
    accountInfo.innerHTML = `
      <div class="status-row"><span class="muted">User ID</span><strong>${currentUserBundle.authUser.uid}</strong></div>
      <div class="status-row"><span class="muted">Email</span><strong>${currentUserBundle.profile?.email || currentUserBundle.authUser.email || "Not set"}</strong></div>
    `;

    const result = await fetchSubscriptionStatus(currentUserBundle.authUser.uid);
    renderStatus(result.subscription);
    await syncSubscriptionToFirebase(currentUserBundle.authUser.uid, result.subscription);
  } catch (error) {
    accountInfo.innerHTML = `<div class="notice">${error.message}</div>`;
    subscriptionInfo.innerHTML = "";
    accessNotice.innerHTML = "Please log in first to view your subscription dashboard.";
  }
}

init();
