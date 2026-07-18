const nodemailer = require("nodemailer");

const ADMIN_EMAIL = "orvellomonte@gmail.com";

const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "")) && String(email || "").length <= 160;

const getSenderEmail = () => {
  const candidates = [process.env.SMTP_FROM, process.env.SMTP_USER, ADMIN_EMAIL];
  return candidates.find(isValidEmail) || ADMIN_EMAIL;
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

const sendTransactionalEmail = async ({ to, subject, text, html, attachments = [] }) => {
  if (!isValidEmail(to)) {
    throw new Error("Invalid recipient email.");
  }

  const from = getSenderEmail();

  if (process.env.BREVO_API_KEY) {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: { name: "Orvello Monte", email: from },
        to: [{ email: to }],
        replyTo: { email: ADMIN_EMAIL },
        subject,
        textContent: text,
        htmlContent: html,
        attachment: attachments.map((attachment) => ({
          name: attachment.filename,
          content: Buffer.from(attachment.content).toString("base64")
        }))
      })
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Brevo API could not send the message.");
    }

    return { provider: "brevo", messageId: String(result.messageId || "") };
  }

  const result = await getTransport().sendMail({
    from: `Orvello Monte <${from}>`,
    replyTo: ADMIN_EMAIL,
    to,
    subject,
    text,
    html,
    attachments
  });

  return { provider: "smtp", messageId: String(result.messageId || "") };
};

module.exports = {
  isValidEmail,
  sendTransactionalEmail
};
