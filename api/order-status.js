const crypto = require("crypto");
const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID = "orvellomonte-392cf";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const rateLimitBuckets = globalThis.__orvelloOrderStatusRateLimitBuckets || new Map();
globalThis.__orvelloOrderStatusRateLimitBuckets = rateLimitBuckets;

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
  res.setHeader("Cache-Control", "no-store, private");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(status).json(payload);
};

const getClientIp = (req) => String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || "")
  .split(",")[0]
  .trim()
  .slice(0, 64);

const isRateLimited = (ip) => {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateLimitBuckets.set(ip, recent);
  return false;
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const maskEmail = (email) => {
  const [local = "", domain = ""] = String(email || "").split("@");
  if (!local || !domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
};

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  if (isRateLimited(getClientIp(req))) {
    sendJson(res, 429, { error: "Cok fazla sorgu." });
    return;
  }

  const merchantOid = String(req.query?.merchant_oid || "").trim();
  const statusToken = String(req.query?.status_token || "").trim();

  if (!/^OM[A-Z0-9]{15,64}$/.test(merchantOid) || statusToken.length < 20 || statusToken.length > 100) {
    sendJson(res, 400, { error: "Gecersiz siparis bilgisi." });
    return;
  }

  try {
    getFirebaseApp();
    const snapshot = await admin.firestore().collection("orders").doc(merchantOid).get();

    if (!snapshot.exists) {
      sendJson(res, 404, { exists: false });
      return;
    }

    const order = snapshot.data() || {};
    const expectedHash = String(order.payment?.statusTokenHash || "");
    const incomingHash = crypto.createHash("sha256").update(statusToken).digest("hex");

    if (!expectedHash || !safeEqual(incomingHash, expectedHash)) {
      sendJson(res, 403, { error: "Siparis dogrulanamadi." });
      return;
    }

    sendJson(res, 200, {
      exists: true,
      merchantOid,
      status: String(order.payment?.status || "pending"),
      orderStatus: String(order.status || "new"),
      customerName: String(order.customer?.fullName || "").split(/\s+/)[0].slice(0, 40),
      email: maskEmail(order.customer?.email),
      total: Number(order.total || 0),
      currency: String(order.payment?.currency || "TL"),
      itemCount: (Array.isArray(order.items) ? order.items : []).reduce(
        (sum, item) => sum + Math.max(1, Number.parseInt(item.quantity, 10) || 1),
        0
      ),
      emailStatus: String(order.payment?.confirmationEmail?.status || "pending")
    });
  } catch (error) {
    console.error("[order-status]", error);
    sendJson(res, 500, { error: "Siparis durumu alinamadi." });
  }
};
