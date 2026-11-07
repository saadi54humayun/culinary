const crypto = require("crypto");
const AuthToken = require("../models/AuthToken");
const { sendOtpEmail } = require("./emailService");

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const recentByIp = new Map();

function requireOtpSecret() {
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.length < 32) {
    const error = new Error("OTP email verification is not configured."); error.status = 503; error.code = "OTP_NOT_CONFIGURED"; throw error;
  }
}

function hmacOtp({ code, challengeId, userId, purpose }) {
  return crypto.createHmac("sha256", process.env.OTP_SECRET).update(`${purpose}:${challengeId}:${userId}:${code}`).digest("hex");
}

function validCode(code) { return typeof code === "string" && /^\d{6}$/.test(code); }
function clientIp(req) { return req.ip || req.socket?.remoteAddress || "unknown"; }
function ipAllowed(req, bucket, limit) {
  const key = `${bucket}:${clientIp(req)}`; const now = Date.now();
  const values = (recentByIp.get(key) || []).filter((value) => now - value < 60_000);
  if (values.length >= limit) return false;
  recentByIp.set(key, [...values, now]); return true;
}

async function issueOtp({ user, purpose, req, force = false }) {
  requireOtpSecret();
  if (!ipAllowed(req, `send:${purpose}`, 10)) { const error = new Error("Please wait before requesting another code."); error.status = 429; throw error; }
  const now = new Date();
  const active = await AuthToken.findOne({ user: user._id, purpose, consumedAt: null, expiresAt: { $gt: now } }).sort({ createdAt: -1 });
  if (active && !force && active.lastSentAt && now - active.lastSentAt < RESEND_COOLDOWN_MS) { const error = new Error("Please wait before requesting another code."); error.status = 429; error.retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now - active.lastSentAt)) / 1000); throw error; }
  if (active) await AuthToken.updateOne({ _id: active._id, consumedAt: null }, { $set: { consumedAt: now } });
  const challengeId = crypto.randomBytes(18).toString("base64url");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = await AuthToken.create({ user: user._id, purpose, challengeId, tokenHash: hmacOtp({ code, challengeId, userId: user._id.toString(), purpose }), expiresAt: new Date(now.getTime() + OTP_TTL_MS), lastSentAt: now });
  try { await sendOtpEmail({ to: user.email, code, purpose }); }
  catch (error) { await AuthToken.updateOne({ _id: challenge._id }, { $set: { consumedAt: new Date() } }); throw error; }
  return { challengeId, expiresAt: challenge.expiresAt, resendAfterSeconds: 60 };
}

async function consumeOtp({ challengeId, code, purpose, req }) {
  requireOtpSecret();
  if (!ipAllowed(req, `verify:${purpose}`, 20)) { const error = new Error("Too many verification attempts. Please wait."); error.status = 429; throw error; }
  if (typeof challengeId !== "string" || challengeId.length > 100 || !validCode(code)) { const error = new Error("That code is invalid or expired."); error.status = 400; throw error; }
  const token = await AuthToken.findOne({ challengeId, purpose, consumedAt: null, expiresAt: { $gt: new Date() } }).select("+tokenHash");
  if (!token) { const error = new Error("That code is invalid or expired."); error.status = 400; throw error; }
  const expected = hmacOtp({ code, challengeId, userId: token.user.toString(), purpose });
  const matches = crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token.tokenHash, "hex"));
  if (!matches) {
    await AuthToken.findOneAndUpdate({ _id: token._id, consumedAt: null, failedAttempts: { $lt: MAX_ATTEMPTS } }, { $inc: { failedAttempts: 1 } });
    const error = new Error("That code is invalid or expired."); error.status = 400; throw error;
  }
  const consumed = await AuthToken.findOneAndUpdate({ _id: token._id, consumedAt: null, failedAttempts: { $lt: MAX_ATTEMPTS }, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
  if (!consumed) { const error = new Error("That code is invalid or expired."); error.status = 400; throw error; }
  return consumed;
}

async function issueResetGrant(user) {
  const grant = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(grant).digest("hex");
  await AuthToken.create({ user: user._id, purpose: "password-reset-grant", tokenHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  return grant;
}

async function consumeResetGrant(grant) {
  if (typeof grant !== "string" || grant.length < 32) return null;
  const hash = crypto.createHash("sha256").update(grant).digest("hex");
  return AuthToken.findOneAndUpdate({ purpose: "password-reset-grant", tokenHash: hash, consumedAt: null, expiresAt: { $gt: new Date() } }, { $set: { consumedAt: new Date() } }, { new: true });
}

module.exports = { issueOtp, consumeOtp, issueResetGrant, consumeResetGrant, ipAllowed };
