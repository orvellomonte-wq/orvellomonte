const admin = require("firebase-admin");
const { buildPaidOrderEmail } = require("../lib/order-email");
const { buildPaidOrderReceiptPdf } = require("../lib/order-receipt");
const { sendTransactionalEmail } = require("../lib/mail");

const ADMIN_EMAIL = "orvellomonte@gmail.com";
const FIREBASE_PROJECT_ID = "orvellomonte-392cf";
const ALLOWED_ORIGINS = new Set([
  "https://www.orvellomonte.com",
  "https://orvellomonte.com"
]);

if (process.env.VERCEL_URL) {
  ALLOWED_ORIGINS.add(`https://${process.env.VERCEL_URL}`);
}

const getServiceAccount = () => {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing.");
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
  }
  return serviceAccount;
};

const getFirebaseApp = () => admin.apps.length
  ? admin.app()
  : admin.initializeApp({
      credential: admin.credential.cert(getServiceAccount()),
      projectId: FIREBASE_PROJECT_ID
    });

const sendJson = (res, status, payload) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.status(status).json(payload);
};

const getLatestBrevoTestEvent = async (subjectNeedle = "[TEST") => {
  if (!process.env.BREVO_API_KEY) {
    return null;
  }

  const params = new URLSearchParams({
    email: ADMIN_EMAIL,
    days: "1",
    limit: "30",
    sort: "desc"
  });
  const response = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?${params}`, {
    headers: {
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY
    }
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { event: "query_failed", reason: String(result.message || response.status) };
  }

  const events = Array.isArray(result.events) ? result.events : [];
  const testEvent = events.find((event) => String(event.subject || "").includes(subjectNeedle));
  if (!testEvent) {
    return { event: "not_found", reason: "Son 24 saatte olay bulunamadi." };
  }

  return {
    event: String(testEvent.event || "unknown"),
    reason: String(testEvent.reason || ""),
    date: String(testEvent.date || ""),
    subject: String(testEvent.subject || "")
  };
};

module.exports = async (req, res) => {
  const origin = String(req.headers.origin || "");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    sendJson(res, 403, { error: "Gecersiz istek kaynagi." });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    getFirebaseApp();
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      sendJson(res, 401, { error: "Admin oturumu bulunamadi." });
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(token, true);
    if (decodedToken.email?.toLowerCase() !== ADMIN_EMAIL) {
      sendJson(res, 403, { error: "Bu islem icin admin hesabi gerekir." });
      return;
    }

    const merchantOid = `TEST${Date.now()}`;
    const order = {
      customer: { fullName: "Orvello Monte Test", email: ADMIN_EMAIL },
      items: [{
        name: "TEST URUNU - GONDERIM YAPILMAZ",
        size: "M",
        price: 1490,
        quantity: 1
      }],
      subtotal: 1490,
      discount: null,
      shipping: { amount: 149 },
      total: 1639
    };
    const email = buildPaidOrderEmail(merchantOid, order);
    const testBanner = '<div style="padding:14px;background:#b32020;color:#fff;text-align:center;font-family:Arial,sans-serif;font-weight:900">TEST E-POSTASI - GERCEK SIPARIS DEGILDIR</div>';
    const delivery = await sendTransactionalEmail({
      to: ADMIN_EMAIL,
      subject: `[TEST FATURA] Orvello Monte siparis ve fatura ozeti - ${merchantOid}`,
      text: `TEST E-POSTASI - GERCEK SIPARIS DEGILDIR\n\n${email.text}`,
      html: email.html.replace('<div style="max-width:680px', `${testBanner}<div style="max-width:680px`),
      attachments: [{
        filename: `TEST-orvello-monte-siparis-${merchantOid}.pdf`,
        content: buildPaidOrderReceiptPdf(merchantOid, order),
        contentType: "application/pdf"
      }]
    });

    let deliveryEvent = null;
    if (delivery.provider === "brevo") {
      const terminalEvents = new Set(["delivered", "blocked", "hard_bounce", "soft_bounce", "deferred", "invalid"]);

      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        deliveryEvent = await getLatestBrevoTestEvent(merchantOid).catch(() => null);

        if (deliveryEvent && terminalEvents.has(deliveryEvent.event)) {
          break;
        }
      }
    }

    sendJson(res, 200, {
      sent: true,
      provider: delivery.provider,
      providerResponse: delivery.response || "",
      deliveryEvent,
      recipient: ADMIN_EMAIL,
      merchantOid
    });
  } catch (error) {
    console.error("[send-test-invoice]", error);
    const brevoEvent = await getLatestBrevoTestEvent().catch(() => null);
    const brevoStatus = brevoEvent
      ? ` | Brevo son durum: ${brevoEvent.event}${brevoEvent.reason ? ` (${brevoEvent.reason})` : ""}`
      : "";
    sendJson(res, 500, {
      error: `Test faturasi gonderilemedi: ${String(error.message || "Bilinmeyen hata").slice(0, 180)}${brevoStatus}`.slice(0, 420)
    });
  }
};
