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
      subject: `[TEST SMTP] Orvello Monte siparis ve fatura ozeti - ${merchantOid}`,
      text: `TEST E-POSTASI - GERCEK SIPARIS DEGILDIR\n\n${email.text}`,
      html: email.html.replace('<div style="max-width:680px', `${testBanner}<div style="max-width:680px`),
      attachments: [{
        filename: `TEST-orvello-monte-siparis-${merchantOid}.pdf`,
        content: buildPaidOrderReceiptPdf(merchantOid, order),
        contentType: "application/pdf"
      }]
    });

    sendJson(res, 200, {
      sent: true,
      provider: delivery.provider,
      providerResponse: delivery.response || "",
      recipient: ADMIN_EMAIL,
      merchantOid
    });
  } catch (error) {
    console.error("[send-test-invoice]", error);
    sendJson(res, 500, { error: "Test faturasi gonderilemedi." });
  }
};
