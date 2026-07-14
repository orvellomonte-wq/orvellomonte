const crypto = require("crypto");
const admin = require("firebase-admin");
const { waitUntil } = require("@vercel/functions");

const FIREBASE_PROJECT_ID = "orvellomonte-392cf";

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

const readRawBody = (req) => new Promise((resolve, reject) => {
  if (req.readableEnded) {
    resolve("");
    return;
  }

  let rawBody = "";

  req.setEncoding?.("utf8");
  req.on?.("data", (chunk) => {
    rawBody += chunk;
  });
  req.on?.("end", () => resolve(rawBody));
  req.on?.("error", reject);
});

const parseBody = async (req) => {
  if (Buffer.isBuffer(req.body)) {
    return Object.fromEntries(new URLSearchParams(req.body.toString("utf8")).entries());
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const params = new URLSearchParams(String(req.body || ""));

  if ([...params.keys()].length > 0) {
    return Object.fromEntries(params.entries());
  }

  const rawBody = await readRawBody(req);
  return Object.fromEntries(new URLSearchParams(rawBody).entries());
};

const sendText = (res, status, text) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(text);
};

const sendJson = (res, status, payload) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
};

const getRequestMetadata = (req) => ({
  sourceIp: String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "")
    .split(",")[0]
    .trim()
    .slice(0, 64),
  userAgent: String(req.headers["user-agent"] || "").slice(0, 300)
});

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));

  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const getStockDeductions = (items) => {
  const deductions = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const productId = String(item.productId || "").trim();
    const size = String(item.size || "Standart").trim() || "Standart";
    const quantity = Math.max(1, Math.min(999, Number.parseInt(item.quantity, 10) || 1));

    if (!productId) {
      continue;
    }

    const current = deductions.get(productId) || {
      productId,
      totalQuantity: 0,
      sizeQuantities: {}
    };

    current.totalQuantity += quantity;
    current.sizeQuantities[size] = (current.sizeQuantities[size] || 0) + quantity;
    deductions.set(productId, current);
  }

  return [...deductions.values()];
};

const deductPaidOrderStock = async (db, orderRef, merchantOid, paidAmount, rawStatus) => {
  await db.runTransaction(async (transaction) => {
    const orderSnapshot = await transaction.get(orderRef);

    if (!orderSnapshot.exists) {
      return;
    }

    const orderData = orderSnapshot.data() || {};
    const currentPaymentStatus = orderData.payment?.status;

    if (["failed", "amount_mismatch"].includes(currentPaymentStatus)) {
      return;
    }

    if (currentPaymentStatus === "paid" && orderData.payment?.stockDeducted === true) {
      return;
    }

    const requestedAmount = Number(orderData.payment?.requestedAmount || 0);

    if (requestedAmount > 0 && paidAmount < requestedAmount) {
      transaction.update(orderRef, {
        "payment.status": "amount_mismatch",
        "payment.provider": "paytr",
        "payment.merchantOid": merchantOid,
        "payment.totalAmount": paidAmount,
        "payment.requestedAmount": requestedAmount,
        "payment.failedReasonMessage": "PayTR total_amount requestedAmount altinda geldi.",
        "payment.failedAt": admin.firestore.FieldValue.serverTimestamp(),
        "payment.rawStatus": rawStatus,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    const deductions = getStockDeductions(orderData.items);
    const productRefs = deductions.map((deduction) =>
      db.collection("products").doc(deduction.productId)
    );
    const productSnapshots = [];

    for (const productRef of productRefs) {
      productSnapshots.push(await transaction.get(productRef));
    }

    const stockIssues = [];

    deductions.forEach((deduction, index) => {
      const productSnapshot = productSnapshots[index];

      if (!productSnapshot.exists) {
        stockIssues.push({
          productId: deduction.productId,
          quantity: deduction.totalQuantity,
          reason: "product_not_found"
        });
        return;
      }

      const productData = productSnapshot.data() || {};
      const currentStock = Number(productData.stock || 0);
      const sizeStocks = productData.sizeStocks && typeof productData.sizeStocks === "object"
        ? { ...productData.sizeStocks }
        : {};

      if (currentStock < deduction.totalQuantity) {
        stockIssues.push({
          productId: deduction.productId,
          quantity: deduction.totalQuantity,
          stockBefore: currentStock,
          reason: "insufficient_total_stock"
        });
      }

      for (const [size, quantity] of Object.entries(deduction.sizeQuantities)) {
        const currentSizeStock = Number(sizeStocks[size] ?? currentStock);

        if (currentSizeStock < quantity) {
          stockIssues.push({
            productId: deduction.productId,
            size,
            quantity,
            sizeStockBefore: currentSizeStock,
            reason: "insufficient_size_stock"
          });
        }

        sizeStocks[size] = Math.max(0, currentSizeStock - quantity);
      }

      transaction.update(productRefs[index], {
        stock: Math.max(0, currentStock - deduction.totalQuantity),
        sizeStocks,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    const orderUpdate = {
      "payment.status": "paid",
      "payment.provider": "paytr",
      "payment.merchantOid": merchantOid,
      "payment.totalAmount": paidAmount,
      "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
      "payment.rawStatus": rawStatus,
      "payment.stockDeducted": true,
      "payment.stockDeductedAt": admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (stockIssues.length > 0) {
      orderUpdate["payment.stockIssues"] = stockIssues;
    }

    transaction.update(orderRef, orderUpdate);
  });
};

const processVerifiedNotification = async ({ merchantOid, status, totalAmount, post, requestMetadata }) => {
  getFirebaseApp();
  const db = admin.firestore();
  const orderRef = db.collection("orders").doc(merchantOid);
  const orderSnapshot = await orderRef.get();

  if (!orderSnapshot.exists) {
    return;
  }

  await orderRef.update({
    "payment.callbackReceiptCount": admin.firestore.FieldValue.increment(1),
    "payment.lastCallbackReceivedAt": admin.firestore.FieldValue.serverTimestamp(),
    "payment.lastCallbackSourceIp": requestMetadata.sourceIp,
    "payment.lastCallbackUserAgent": requestMetadata.userAgent
  });

  const orderData = orderSnapshot.data() || {};
  const currentPaymentStatus = orderData.payment?.status;

  if (
    ["failed", "amount_mismatch"].includes(currentPaymentStatus)
    || (currentPaymentStatus === "paid" && (orderData.payment?.stockDeducted === true || status !== "success"))
  ) {
    return;
  }

  if (status === "success") {
    await deductPaidOrderStock(db, orderRef, merchantOid, Number(totalAmount), status);
    return;
  }

  await orderRef.update({
    "payment.status": "failed",
    "payment.provider": "paytr",
    "payment.merchantOid": merchantOid,
    "payment.totalAmount": Number(totalAmount),
    "payment.failedReasonCode": String(post.failed_reason_code || ""),
    "payment.failedReasonMessage": String(post.failed_reason_msg || ""),
    "payment.failedAt": admin.firestore.FieldValue.serverTimestamp(),
    "payment.rawStatus": status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
};

const processVerifiedNotificationWithRetry = async (payload) => {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await processVerifiedNotification(payload);
      return;
    } catch (error) {
      lastError = error;
      console.error(`[paytr-callback-processing-attempt-${attempt}]`, error);

      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
};

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
    const merchantOid = String(req.query?.merchant_oid || "").trim();

    if (merchantOid) {
      try {
        const merchantKey = process.env.PAYTR_MERCHANT_KEY;
        const diagnosticToken = String(req.headers["x-paytr-diagnostic-token"] || "");
        const expectedToken = crypto
          .createHmac("sha256", merchantKey || "")
          .update(`diagnostic:${merchantOid}`)
          .digest("base64");

        if (!merchantKey || !safeEqual(diagnosticToken, expectedToken)) {
          sendText(res, 403, "Forbidden");
          return;
        }

        getFirebaseApp();
        const orderSnapshot = await admin.firestore().collection("orders").doc(merchantOid).get();

        if (!orderSnapshot.exists) {
          sendJson(res, 404, { exists: false });
          return;
        }

        const payment = orderSnapshot.data()?.payment || {};
        const receivedAt = payment.lastCallbackReceivedAt?.toDate?.();

        sendJson(res, 200, {
          exists: true,
          callbackReceiptCount: Number(payment.callbackReceiptCount || 0),
          lastCallbackReceivedAt: receivedAt ? receivedAt.toISOString() : null,
          lastCallbackSourceIp: payment.lastCallbackSourceIp || "",
          lastCallbackUserAgent: payment.lastCallbackUserAgent || "",
          paymentStatus: payment.status || ""
        });
      } catch (error) {
        console.error("[paytr-callback-diagnostic]", error);
        sendText(res, 500, "Diagnostic failed");
      }

      return;
    }

    sendText(res, 200, "OK");
    return;
  }

  if (req.method !== "POST") {
    sendText(res, 405, "");
    return;
  }

  try {
    const merchantKey = process.env.PAYTR_MERCHANT_KEY;
    const merchantSalt = process.env.PAYTR_MERCHANT_SALT;

    if (!merchantKey || !merchantSalt) {
      throw new Error("PAYTR env missing.");
    }

    const post = await parseBody(req);
    const merchantOid = String(post.merchant_oid || "");
    const status = String(post.status || "");
    const totalAmount = String(post.total_amount || "");
    const incomingHash = String(post.hash || "");

    if (!merchantOid || !status || !totalAmount || !incomingHash) {
      sendText(res, 400, "PAYTR notification failed: missing fields");
      return;
    }

    const expectedHash = crypto
      .createHmac("sha256", merchantKey)
      .update(merchantOid + merchantSalt + status + totalAmount)
      .digest("base64");

    if (expectedHash !== incomingHash) {
      sendText(res, 400, "PAYTR notification failed: bad hash");
      return;
    }

    const processingPromise = processVerifiedNotificationWithRetry({
      merchantOid,
      status,
      totalAmount,
      post,
      requestMetadata: getRequestMetadata(req)
    }).catch((error) => {
      console.error("[paytr-callback-processing]", error);
    });

    waitUntil(processingPromise);

    sendText(res, 200, "OK");
  } catch (error) {
    console.error("[paytr-callback]", error);
    sendText(res, 500, "PAYTR notification failed");
  }
};
