const nodemailer = require("nodemailer");

function smtpConfig() {
  const port = Number(process.env.SMTP_PORT);
  if (!process.env.SMTP_HOST || !Number.isInteger(port) || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.MAIL_FROM) return null;
  return { host: process.env.SMTP_HOST, port, secure: String(process.env.SMTP_SECURE).toLowerCase() === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } };
}

async function sendOtpEmail({ to, code, purpose }) {
  // Tests can inject the mail sender. Preview deliberately does not log OTPs.
  if (process.env.MAIL_MODE === "preview") return { delivered: true, preview: true };
  const config = smtpConfig();
  if (!config) {
    const error = new Error("Email delivery is not configured.");
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }
  const title = purpose === "email-verification" ? "Verify your Culinary email" : "Reset your Culinary password";
  const isVerification = purpose === "email-verification";
  const eyebrow = isVerification ? "WELCOME TO CULINARY" : "ACCOUNT SECURITY";
  const heading = isVerification ? "One last step." : "Reset your password";
  const intro = isVerification
    ? "Enter this code in Culinary to verify your email and begin sharing recipes."
    : "Enter this code in Culinary to continue resetting your password.";
  const safetyNote = isVerification
    ? "If you did not create a Culinary account, you can safely ignore this email."
    : "If you did not request a password reset, you can safely ignore this email.";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fff3d9;color:#1e382d;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:36px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fffdf8;border:1px solid #e7dcc6;border-radius:18px;overflow:hidden;">
      <tr><td style="padding:30px 34px 24px;border-bottom:1px solid #e7dcc6;">
        <p style="margin:0 0 10px;color:#bd5939;font-size:12px;font-weight:700;letter-spacing:1.7px;">${eyebrow}</p>
        <h1 style="margin:0;color:#1e382d;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.1;">${heading}</h1>
      </td></tr>
      <tr><td style="padding:28px 34px 32px;">
        <p style="margin:0;color:#58675e;font-size:16px;line-height:1.55;">${intro}</p>
        <div style="margin:24px 0;padding:18px;background:#edf3e9;border:1px solid #d9e6d3;border-radius:12px;text-align:center;">
          <span style="color:#1f5b42;font-size:30px;font-weight:700;letter-spacing:8px;">${code}</span>
        </div>
        <p style="margin:0 0 20px;color:#58675e;font-size:14px;line-height:1.5;">This code expires in <strong>10 minutes</strong> and can only be used once.</p>
        <p style="margin:0;color:#7c857d;font-size:13px;line-height:1.5;">${safetyNote}</p>
      </td></tr>
      <tr><td style="padding:18px 34px;background:#f7f1e7;color:#7c857d;font-size:12px;">Culinary · Cook, share, and discover.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
  const transporter = nodemailer.createTransport(config);
  await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject: title, text: `Your Culinary code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`, html });
  return { delivered: true, preview: false };
}

module.exports = { sendOtpEmail, smtpConfig };
