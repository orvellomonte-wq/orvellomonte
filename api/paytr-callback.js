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

const parseBody = (req) => {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const params = new URLSearchParams(String(req.body || ""));
  return Object.fromEntries(params.entries());
};

const sendText = (res, status, text) => {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).send(text);
};

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");

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

    const post = parseBody(req);
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

    const currentPaymentStatus = orderSnapshot.data()?.payment?.status;

    if (currentPaymentStatus === "paid" || currentPaymentStatus === "failed") {
      sendText(res, 200, "OK");
      return;
    }

    if (status === "success") {
      await orderRef.update({
        "payment.status": "paid",
        "payment.provider": "paytr",
        "payment.merchantOid": merchantOid,
        "payment.totalAmount": Number(totalAmount),
        "payment.paidAt": admin.firestore.FieldValue.serverTimestamp(),
        "payment.rawStatus": status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
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
