const crypto = require("crypto");
const admin = require("firebase-admin");

const FIREBASE_PROJECT_ID = "orvellomonte-392cf";
const PAYTR_TOKEN_URL = "https://www.paytr.com/odeme/api/get-token";
const CANONICAL_SITE_URL = "https://www.orvellomonte.com";
const ALLOWED_ORIGINS = new Set([
  "https://www.orvellomonte.com",
  "https://orvellomonte.com"
]);

if (process.env.VERCEL_URL) {
  ALLOWED_ORIGINS.add(`https://${process.env.VERCEL_URL}`);
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 18;
const FREE_SHIPPING_THRESHOLD = 2000;
const STANDARD_SHIPPING_FEE = 149;
const rateLimitBuckets = globalThis.__orvelloPaytrRateLimitBuckets || new Map();
globalThis.__orvelloPaytrRateLimitBuckets = rateLimitBuckets;

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

const getFirebaseApp = () => {
  if (admin.apps.length) {
    return admin.app();
  }

  return admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    projectId: FIREBASE_PROJECT_ID
  });
};

const sendJson = (res, status, payload) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
};

const parseJsonBody = (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  return {};
};

const isAllowedOrigin = (req) => {
  const origin = req.headers.origin;
  return Boolean(origin && ALLOWED_ORIGINS.has(origin));
};

const getClientIp = (req) => {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const realIp = String(req.headers["x-real-ip"] || "").trim();
  const socketIp = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  return (forwardedFor || realIp || socketIp || "127.0.0.1").slice(0, 39);
};

const isRateLimited = (ip) => {
  const now = Date.now();
  const recent = (rateLimitBuckets.get(ip) || []).filter((time) => now - time < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateLimitBuckets.set(ip, recent);

  for (const [bucketIp, hits] of rateLimitBuckets.entries()) {
    if (hits.length === 0 || now - hits[hits.length - 1] > RATE_LIMIT_WINDOW_MS) {
      rateLimitBuckets.delete(bucketIp);
    }
  }

  return false;
};

const cleanText = (value, maxLength) =>
  String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);

const normalizeMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(2)) : 0;
};

const normalizeImageUrl = (value) => {
  const imageUrl = String(value || "").trim();

  if (imageUrl.startsWith("data:") && imageUrl.length > 180000) {
    return "";
  }

  return imageUrl.slice(0, 180000);
};

const getPublicBaseUrl = () => {
  const configuredUrl = String(process.env.PUBLIC_SITE_URL || CANONICAL_SITE_URL)
    .trim()
    .replace(/\/+$/, "");

  if (!configuredUrl.startsWith("https://")) {
    throw new Error("PUBLIC_SITE_URL must start with https://");
  }

  const publicUrl = new URL(configuredUrl);

  // The apex domain redirects to www with HTTP 307. PayTR return URLs must
  // point directly at the canonical host so the payment flow is not redirected.
  if (publicUrl.hostname === "orvellomonte.com") {
    publicUrl.hostname = "www.orvellomonte.com";
  }

  return publicUrl.toString().replace(/\/+$/, "");
};

const getActiveDiscount = async (db, discount) => {
  const code = cleanText(discount?.code, 40).toUpperCase();

  if (!code) {
    return null;
  }

  const snapshot = await db
    .collection("discounts")
    .where("code", "==", code)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const data = snapshot.docs[0].data();
  const percent = Number(data.percent || 0);

  if (!Number.isFinite(percent) || percent < 1 || percent > 90) {
    return null;
  }

  return { code: data.code || code, percent };
};

const buildOrder = async (db, body) => {
  const customer = body.customer || {};
  const fullName = cleanText(customer.fullName, 60);
  const phone = cleanText(customer.phone, 20);
  const address = cleanText(customer.address, 400);
  const email = cleanText(customer.email, 100).toLowerCase() || "musteri@orvellomonte.com";
  const items = Array.isArray(body.items) ? body.items : [];

  if (!fullName || !phone || !address) {
    throw new Error("Ad soyad, telefon ve adres zorunlu.");
  }

  if (!items.length || items.length > 20) {
    throw new Error("Sepet bos veya cok fazla urun var.");
  }

  const orderItems = items.map((item) => {
    const quantity = Math.max(1, Math.min(20, Number.parseInt(item.quantity, 10) || 1));
    const price = normalizeMoney(item.price);
    const name = cleanText(item.name, 120);

    if (!name || price <= 0) {
      throw new Error("Sepette gecersiz urun var.");
    }

    return {
      cartItemId: cleanText(item.cartItemId || item.id, 160),
      productId: cleanText(item.productId, 160),
      name,
      size: cleanText(item.size || "Standart", 40),
      imageUrl: normalizeImageUrl(item.imageUrl),
      price,
      quantity
    };
  });

  const subtotal = normalizeMoney(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0));
  const activeDiscount = await getActiveDiscount(db, body.discount);
  const discountAmount = activeDiscount
    ? normalizeMoney((subtotal * activeDiscount.percent) / 100)
    : 0;
  const shippingAmount = subtotal < FREE_SHIPPING_THRESHOLD ? STANDARD_SHIPPING_FEE : 0;
  const total = Math.max(1, normalizeMoney(subtotal - discountAmount + shippingAmount));
  const merchantOid = `OM${Date.now()}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;

  return {
    merchantOid,
    customer: { fullName, phone, address, email },
    userId: cleanText(body.userId, 128),
    items: orderItems,
    subtotal,
    discount: activeDiscount ? {
      code: activeDiscount.code,
      percent: activeDiscount.percent,
      amount: discountAmount
    } : null,
    shipping: {
      amount: shippingAmount,
      free: shippingAmount === 0,
      threshold: FREE_SHIPPING_THRESHOLD
    },
    total,
    paymentAmount: Math.round(total * 100),
    source: cleanText(body.source || "site", 32)
  };
};

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (!isAllowedOrigin(req)) {
    sendJson(res, 403, { error: "Gecersiz istek kaynagi." });
    return;
  }

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const userIp = getClientIp(req);

  if (isRateLimited(userIp)) {
    sendJson(res, 429, { error: "Cok fazla odeme denemesi. Biraz sonra tekrar dene." });
    return;
  }

  try {
    const merchantId = process.env.PAYTR_MERCHANT_ID;
    const merchantKey = process.env.PAYTR_MERCHANT_KEY;
    const merchantSalt = process.env.PAYTR_MERCHANT_SALT;

    if (!merchantId || !merchantKey || !merchantSalt) {
      throw new Error("PAYTR env missing.");
    }

    getFirebaseApp();
    const db = admin.firestore();
    const body = parseJsonBody(req);
    const order = await buildOrder(db, body);
    const baseUrl = getPublicBaseUrl();
    const currency = "TL";
    const testMode = String(process.env.PAYTR_TEST_MODE ?? "0");
    const noInstallment = String(process.env.PAYTR_NO_INSTALLMENT ?? "0");
    const maxInstallment = String(process.env.PAYTR_MAX_INSTALLMENT ?? "0");
    const basketItems = order.items.map((item) => [
        item.name,
        item.price.toFixed(2),
        item.quantity
      ]);

    if (order.shipping.amount > 0) {
      basketItems.push(["Kargo", order.shipping.amount.toFixed(2), 1]);
    }

    const userBasket = Buffer
      .from(JSON.stringify(basketItems))
      .toString("base64");

    const hashString = [
      merchantId,
      userIp,
      order.merchantOid,
      order.customer.email,
      order.paymentAmount,
      userBasket,
      noInstallment,
      maxInstallment,
      currency,
      testMode
    ].join("");
    const paytrToken = crypto
      .createHmac("sha256", merchantKey)
      .update(hashString + merchantSalt)
      .digest("base64");

    await db.collection("orders").doc(order.merchantOid).set({
      customer: order.customer,
      userId: order.userId,
      items: order.items,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      total: order.total,
      status: "new",
      source: order.source,
      payment: {
        provider: "paytr",
        status: "pending",
        merchantOid: order.merchantOid,
        requestedAmount: order.paymentAmount,
        currency,
        testMode: testMode === "1"
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    const postValues = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: order.merchantOid,
      email: order.customer.email,
      payment_amount: String(order.paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: String(process.env.PAYTR_DEBUG_ON ?? "0"),
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: order.customer.fullName,
      user_address: order.customer.address,
      user_phone: order.customer.phone,
      merchant_ok_url: `${baseUrl}/odeme-basarili.html`,
      merchant_fail_url: `${baseUrl}/odeme-hata.html`,
      timeout_limit: String(process.env.PAYTR_TIMEOUT_LIMIT ?? "30"),
      currency,
      test_mode: testMode,
      lang: "tr"
    });

    const paytrResponse = await fetch(PAYTR_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: postValues
    });
    const result = await paytrResponse.json().catch(() => ({}));

    if (!paytrResponse.ok || result.status !== "success" || !result.token) {
      await db.collection("orders").doc(order.merchantOid).update({
        "payment.status": "token_failed",
        "payment.reason": result.reason || "PayTR token alinamadi.",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      sendJson(res, 502, { error: result.reason || "PayTR odeme ekrani acilamadi." });
      return;
    }

    sendJson(res, 200, {
      token: result.token,
      merchantOid: order.merchantOid,
      amount: order.total,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${result.token}`
    });
  } catch (error) {
    console.error("[paytr-token]", error);
    sendJson(res, 500, { error: error.message || "PayTR odeme baslatilamadi." });
  }
};
