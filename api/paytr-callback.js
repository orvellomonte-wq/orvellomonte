const crypto = require("crypto");
const admin = require("firebase-admin");

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

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "GET") {
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

    getFirebaseApp();
    const orderRef = admin.firestore().collection("orders").doc(merchantOid);
    const orderSnapshot = await orderRef.get();

    if (!orderSnapshot.exists) {
      sendText(res, 200, "OK");
      return;
    }

    const orderData = orderSnapshot.data() || {};
    const currentPaymentStatus = orderData.payment?.status;

    if (
      ["failed", "amount_mismatch"].includes(currentPaymentStatus)
      || (currentPaymentStatus === "paid" && (orderData.payment?.stockDeducted === true || status !== "success"))
    ) {
      sendText(res, 200, "OK");
      return;
    }

    if (status === "success") {
      const paidAmount = Number(totalAmount);

      await deductPaidOrderStock(admin.firestore(), orderRef, merchantOid, paidAmount, status);
    } else {
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
    }

    sendText(res, 200, "OK");
  } catch (error) {
    console.error("[paytr-callback]", error);
    sendText(res, 500, "PAYTR notification failed");
  }
};
