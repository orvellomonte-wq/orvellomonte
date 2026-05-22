const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const ADMIN_EMAIL = "orvellomonte@gmail.com";
const FIREBASE_PROJECT_ID = "orvellomonte-392cf";
const RECIPIENT_CHUNK_SIZE = 40;

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

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
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON eksik.");
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
    throw new Error("SMTP_HOST, SMTP_USER veya SMTP_PASS eksik.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass }
  });
};

const getSubscriberEmails = async () => {
  const snapshot = await admin.firestore().collection("newsletter_subscribers").get();
  const emails = new Set();

  snapshot.forEach((doc) => {
    const email = String(doc.data().email || "").trim().toLowerCase();

    if (email) {
      emails.add(email);
    }
  });

  return [...emails];
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  try {
    getFirebaseApp();

    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      res.status(401).json({ error: "Admin oturumu bulunamadı." });
      return;
    }

    const decodedToken = await admin.auth().verifyIdToken(token);

    if (decodedToken.email?.toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ error: "Bu işlem için admin hesabı gerekir." });
      return;
    }

    const { subject, message } = parseJsonBody(req);
    const normalizedSubject = String(subject || "").trim();
    const normalizedMessage = String(message || "").trim();

    if (!normalizedSubject || !normalizedMessage) {
      res.status(400).json({ error: "Konu ve mesaj alanları zorunlu." });
      return;
    }

    const emails = await getSubscriberEmails();

    if (!emails.length) {
      res.status(400).json({ error: "Kayıtlı e-posta yok." });
      return;
    }

    const transport = getTransport();
    const from = process.env.SMTP_FROM || process.env.SMTP_USER;

    for (let index = 0; index < emails.length; index += RECIPIENT_CHUNK_SIZE) {
      const chunk = emails.slice(index, index + RECIPIENT_CHUNK_SIZE);

      await transport.sendMail({
        from,
        to: from,
        bcc: chunk,
        subject: normalizedSubject,
        text: normalizedMessage,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6">${escapeHtml(normalizedMessage).replaceAll("\n", "<br>")}</div>`
      });
    }

    res.status(200).json({ sent: emails.length });
  } catch (error) {
    res.status(500).json({ error: error.message || "Mesaj gönderilemedi." });
  }
};
