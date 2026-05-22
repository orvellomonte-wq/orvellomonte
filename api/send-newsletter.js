const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const ADMIN_EMAIL = "orvellomonte@gmail.com";
const FIREBASE_PROJECT_ID = "orvellomonte-392cf";
const RECIPIENT_CHUNK_SIZE = 40;
const MAX_RECIPIENTS = 1000;
const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 8000;
const ALLOWED_ORIGINS = new Set([
  "https://www.orvellomonte.com",
  "https://orvellomonte.com"
]);

if (process.env.VERCEL_URL) {
  ALLOWED_ORIGINS.add(`https://${process.env.VERCEL_URL}`);
}

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")) && String(email || "").length <= 160;

const getSenderEmail = () => {
  const candidates = [
    process.env.SMTP_FROM,
    process.env.SMTP_USER,
    ADMIN_EMAIL
  ];

  return candidates.find(isValidEmail) || ADMIN_EMAIL;
};

const sendJson = (res, status, payload) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(status).json(payload);
};

const isAllowedOrigin = (req) => {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
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

const getTransport = () => {
  const port = Number(process.env.SMTP_PORT || 587);
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP env missing.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass }
  });
};

const sendWithBrevoApi = async ({ emails, subject, message, from }) => {
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { email: from },
      to: [{ email: from }],
      bcc: emails.map((email) => ({ email })),
      subject,
      textContent: message,
      htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(message).replaceAll("\n", "<br>")}</div>`
    })
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(result.message || "Brevo API could not send the message.");
  }
};

const getSubscriberEmails = async () => {
  const snapshot = await admin.firestore().collection("newsletter_subscribers").get();
  const emails = new Set();

  snapshot.forEach((doc) => {
    const email = String(doc.data().email || "").trim().toLowerCase();

    if (isValidEmail(email)) {
      emails.add(email);
    }
  });

  return [...emails];
};

module.exports = async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

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

    const { subject, message } = parseJsonBody(req);
    const normalizedSubject = String(subject || "").trim();
    const normalizedMessage = String(message || "").trim();

    if (!normalizedSubject || !normalizedMessage) {
      sendJson(res, 400, { error: "Konu ve mesaj alanlari zorunlu." });
      return;
    }

    if (normalizedSubject.length > MAX_SUBJECT_LENGTH || normalizedMessage.length > MAX_MESSAGE_LENGTH) {
      sendJson(res, 400, { error: "Konu veya mesaj cok uzun." });
      return;
    }

    const emails = await getSubscriberEmails();

    if (!emails.length) {
      sendJson(res, 400, { error: "Kayitli e-posta yok." });
      return;
    }

    if (emails.length > MAX_RECIPIENTS) {
      sendJson(res, 400, { error: "Tek gonderimde cok fazla alici var." });
      return;
    }

    const from = getSenderEmail();

    const transport = process.env.BREVO_API_KEY ? null : getTransport();

    for (let index = 0; index < emails.length; index += RECIPIENT_CHUNK_SIZE) {
      const chunk = emails.slice(index, index + RECIPIENT_CHUNK_SIZE);

      if (process.env.BREVO_API_KEY) {
        await sendWithBrevoApi({
          emails: chunk,
          subject: normalizedSubject,
          message: normalizedMessage,
          from
        });
      } else {
        await transport.sendMail({
          from,
          to: from,
          bcc: chunk,
          subject: normalizedSubject,
          text: normalizedMessage,
          html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(normalizedMessage).replaceAll("\n", "<br>")}</div>`
        });
      }
    }

    sendJson(res, 200, { sent: emails.length });
  } catch (error) {
    console.error("[send-newsletter]", error);
    sendJson(res, 500, { error: "Mesaj gonderilemedi. Mail servis ayarlarini kontrol et." });
  }
};
