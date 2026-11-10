import {
  createSessionToken,
  sessionCookie,
  verifyPassword,
} from "../../lib/auth.js";
import { getPool } from "../../lib/db.js";
import { asText, parseBody } from "../../lib/http.js";
import { hashIp } from "../../lib/ip.js";

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = "15 minutes";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const body = parseBody(req.body);
  const password = asText(body && body.password);

  if (!password) {
    return res.status(400).json({
      ok: false,
      error: "missing_password",
      message: "Ingresá la contraseña.",
    });
  }

  if (
    !process.env.ADMIN_PASSWORD_HASH ||
    !process.env.ADMIN_SESSION_SECRET ||
    process.env.ADMIN_SESSION_SECRET.length < 32
  ) {
    console.error("Admin login: ADMIN_PASSWORD_HASH or ADMIN_SESSION_SECRET is missing.");
    return res.status(503).json({
      ok: false,
      error: "admin_not_configured",
      message: "El panel todavía no está configurado.",
    });
  }

  const ipHash = hashIp(req);
  let pool = null;

  try {
    pool = getPool();
    const { rows } = await pool.query(
      `select count(*)::int as total
         from admin_login_attempts
        where ip_hash = $1
          and creado_en > now() - interval '${RATE_LIMIT_WINDOW}'`,
      [ipHash]
    );

    if (rows[0].total >= RATE_LIMIT_MAX) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({
        ok: false,
        error: "too_many_attempts",
        message: "Demasiados intentos fallidos. Esperá 15 minutos.",
      });
    }
  } catch (error) {
    // Login must still work if the attempt log is unavailable.
    console.error("Admin login: rate limit unavailable:", error.code || error.name);
    pool = null;
  }

  if (!verifyPassword(password, process.env.ADMIN_PASSWORD_HASH)) {
    if (pool) {
      try {
        await pool.query(
          "insert into admin_login_attempts (ip_hash) values ($1)",
          [ipHash]
        );
        await pool.query(
          "delete from admin_login_attempts where creado_en < now() - interval '2 days'"
        );
      } catch (error) {
        console.error("Admin login: could not record attempt:", error.code || error.name);
      }
    }

    return res.status(401).json({
      ok: false,
      error: "invalid_credentials",
      message: "Contraseña incorrecta.",
    });
  }

  if (pool) {
    try {
      await pool.query("delete from admin_login_attempts where ip_hash = $1", [
        ipHash,
      ]);
    } catch (error) {
      console.error("Admin login: could not clear attempts:", error.code || error.name);
    }
  }

  res.setHeader("Set-Cookie", sessionCookie(createSessionToken()));
  return res.status(200).json({ ok: true });
}
