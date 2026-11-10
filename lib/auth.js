import crypto from "node:crypto";

/**
 * Stateless admin session:
 * - Password: scrypt hash stored in ADMIN_PASSWORD_HASH ("salt:hash").
 * - Session: signed token "expiresAt.signature" in an HttpOnly cookie.
 * - No session table, so it works on serverless functions at any scale.
 */

export const ADMIN_COOKIE = "ac_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof password !== "string" || typeof stored !== "string") return false;

  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;

  const expected = Buffer.from(hash, "hex");
  if (expected.length !== SCRYPT_KEYLEN) return false;

  const actual = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return crypto.timingSafeEqual(expected, actual);
}

export function createSessionToken(now = Date.now()) {
  const expiresAt = now + SESSION_TTL_MS;
  return `${expiresAt}.${sign(String(expiresAt))}`;
}

export function verifySessionToken(token, now = Date.now()) {
  if (typeof token !== "string") return false;

  const [expiresRaw, signature] = token.split(".");
  const expiresAt = Number(expiresRaw);

  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  if (typeof signature !== "string" || signature.length === 0) return false;

  const expected = Buffer.from(sign(String(expiresAt)));
  const actual = Buffer.from(signature);

  return (
    expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  );
}

export function readCookie(req, name = ADMIN_COOKIE) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export function isAuthenticated(req, now = Date.now()) {
  try {
    return verifySessionToken(readCookie(req), now);
  } catch {
    return false;
  }
}

export function sessionCookie(token) {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie() {
  const secure = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}

function sign(value) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    const error = new Error("ADMIN_SESSION_SECRET is not configured");
    error.code = "AUTH_NOT_CONFIGURED";
    throw error;
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`admin:${value}`)
    .digest("hex");
}
