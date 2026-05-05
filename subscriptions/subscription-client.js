import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, get, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAAWjWH55_WogACWc3vNVWrlLrwPYPfgmo",
  authDomain: "swamediaweb.firebaseapp.com",
  databaseURL: "https://swamediaweb-default-rtdb.firebaseio.com",
  projectId: "swamediaweb",
  storageBucket: "swamediaweb.firebasestorage.app",
  messagingSenderId: "70354150749",
  appId: "1:70354150749:web:046e78eb57ce1fe427f4b4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

const SUPABASE_URL = "https://uotkpiamoxpgrmtkpoyi.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVvdGtwaWFtb3hwZ3JtdGtwb3lpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDU0NDEsImV4cCI6MjA5Mjg4MTQ0MX0.wHVxfRT1AVDGiniWvw-sJqZnTKFQeEYW8JawzAhxXu8";
const DONATE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/donate`;
const DONATION_STATUS_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/donation-status`;
const ACTIVATE_SUBSCRIPTION_URL = `${SUPABASE_URL}/functions/v1/activate-subscription`;
const SUBSCRIPTION_STATUS_URL = `${SUPABASE_URL}/functions/v1/subscription-status`;

export const PLAN_MAP = {
  "2_hours": { label: "2 Hours", amount: 500, days: 2 / 24 },
  "6_hours": { label: "6 Hours", amount: 1000, days: 6 / 24 },
  "1_day": { label: "1 Day", amount: 2000, days: 1 },
  "week": { label: "Week", amount: 3000, days: 7 },
  "2_week": { label: "2 Weeks", amount: 5000, days: 14 },
  "month": { label: "Month", amount: 9000, days: 30 },
};

const getHeaders = () => ({
  "Content-Type": "application/json",
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
});

export function formatCurrency(amount) {
  return new Intl.NumberFormat("sw-TZ", {
    style: "currency",
    currency: "TZS",
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));
}

export function normalizePhone(phone, countryCode = "255") {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return `${countryCode}${digits.slice(1)}`;
  if (/^255[67]\d{8}$/.test(digits)) return digits;
  return "";
}

export async function requireCurrentUser() {
  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe();
      if (!user) {
        reject(new Error("Please log in first to manage your subscription."));
        return;
      }

      const userSnap = await get(ref(database, `users/${user.uid}`));
      resolve({
        authUser: user,
        profile: userSnap.exists() ? userSnap.val() : {},
      });
    }, reject);
  });
}

async function callFunction(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers || {}),
    },
  });
  const raw = await response.text();
  let payload = {};

  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch (error) {
    payload = { error: raw || "Unexpected response" };
  }

  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed with HTTP ${response.status}`);
  }

  return payload;
}

export async function createPaymentRequest({ fullName, email, phone, amount, selectedPlan, userId }) {
  return callFunction(DONATE_FUNCTION_URL, {
    method: "POST",
    body: JSON.stringify({
      full_name: fullName,
      email,
      phone,
      amount,
      selected_plan: selectedPlan,
      user_id: userId,
    }),
  });
}

export async function getDonationStatus(donationId) {
  return callFunction(`${DONATION_STATUS_FUNCTION_URL}?id=${encodeURIComponent(donationId)}`, {
    method: "GET",
  });
}

export async function activateSubscription({ donationId, userId, selectedPlan, phone, amount, email }) {
  return callFunction(ACTIVATE_SUBSCRIPTION_URL, {
    method: "POST",
    body: JSON.stringify({
      donation_id: donationId,
      user_id: userId,
      selected_plan: selectedPlan,
      phone,
      amount,
      email,
    }),
  });
}

export async function fetchSubscriptionStatus(userId) {
  return callFunction(`${SUBSCRIPTION_STATUS_URL}?user_id=${encodeURIComponent(userId)}`, {
    method: "GET",
  });
}

export async function syncSubscriptionToFirebase(userId, subscription) {
  const expiryMs = subscription?.expiry_date ? new Date(subscription.expiry_date).getTime() : 0;
  const isPaid = String(subscription?.status || "").toLowerCase() === "paid" && expiryMs > Date.now();

  await update(ref(database, `users/${userId}`), {
    premiumExpiry: isPaid ? expiryMs : 0,
    subscriptionStatus: isPaid ? "paid" : "unpaid",
    subscriptionPlan: subscription?.plan || "",
    subscriptionPlanLabel: subscription?.plan_label || "",
    subscriptionStartDate: subscription?.start_date || null,
    subscriptionExpiry: subscription?.expiry_date || null,
    daysRemaining: Number(subscription?.days_remaining || 0),
    lastSubscriptionSyncAt: Date.now(),
  });
}
