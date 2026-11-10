import crypto from "node:crypto";

/**
 * Hashes the client IP so the database never stores it in clear text.
 * The salt must be stable per deployment (IP_HASH_SALT).
 */
export function hashIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const ip = forwarded || req.socket?.remoteAddress || "unknown";
  const salt = process.env.IP_HASH_SALT || "aroma-codigo";
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}
