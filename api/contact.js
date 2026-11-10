import crypto from "node:crypto";
import { getPool } from "../lib/db.js";
import { validateContact } from "../lib/validation.js";

const MAX_BODY_BYTES = 8_192;
const RATE_LIMIT_MAX = 5;
const REDIRECTS = {
  success: "/?enviado=1#contacto",
  error: "/?error=1#contacto",
};

/**
 * POST /api/contact
 * Persists a contact/suggestion message in PostgreSQL.
 *
 * Accepts JSON (fetch) and application/x-www-form-urlencoded (a plain HTML
 * form without JavaScript). Native form submissions are redirected back to
 * the landing page instead of rendering raw JSON.
 */
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "method_not_allowed" });
  }

  const contentType = String(req.headers["content-type"] || "");
  const nativeForm = contentType.includes("application/x-www-form-urlencoded");
  const body = parseBody(req.body);

  if (!body) {
    return fail(res, nativeForm, 400, "invalid_body", {
      message: "No pudimos leer el formulario. Recargá la página e intentá de nuevo.",
    });
  }

  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) {
    return fail(res, nativeForm, 413, "payload_too_large", {
      message: "El mensaje es demasiado largo.",
    });
  }

  // Honeypot: the field is hidden, so only bots fill it in. Pretend success.
  if (asText(body.website).trim() !== "") {
    return respond(res, nativeForm, 201, { ok: true, id: null });
  }

  const { valid, data, errors } = validateContact(body);

  if (!valid) {
    return fail(res, nativeForm, 400, "validation_error", {
      message: "Revisá los campos marcados.",
      fields: errors,
    });
  }

  try {
    const pool = getPool();
    const ipHash = hashIp(req);

    const { rows: recent } = await pool.query(
      `select count(*)::int as total
         from contact_messages
        where ip_hash = $1
          and creado_en > now() - interval '10 minutes'`,
      [ipHash]
    );

    if (recent[0].total >= RATE_LIMIT_MAX) {
      return fail(res, nativeForm, 429, "rate_limited", {
        message: "Recibimos varios mensajes seguidos. Esperá unos minutos antes de reintentar.",
      });
    }

    const { rows } = await pool.query(
      `insert into contact_messages
         (motivo, nombre, correo, telefono, mensaje, ip_hash, user_agent)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        data.motivo,
        data.nombre,
        data.correo,
        data.telefono,
        data.mensaje,
        ipHash,
        asText(req.headers["user-agent"]).slice(0, 300),
      ]
    );

    return respond(res, nativeForm, 201, { ok: true, id: rows[0].id });
  } catch (error) {
    if (error.code === "DB_NOT_CONFIGURED") {
      console.error("Contact endpoint: DATABASE_URL is not configured.");
    } else {
      // Log the technical cause only; never log the message contents or email.
      console.error(
        "Contact endpoint failed:",
        error.code || error.name,
        error.message
      );
    }

    return fail(res, nativeForm, 500, "server_error", {
      message: "No pudimos guardar tu mensaje. Intentá de nuevo en unos minutos.",
    });
  }
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return Object.fromEntries(new URLSearchParams(body));
    }
  }
  return typeof body === "object" ? body : null;
}

function asText(value) {
  return typeof value === "string" ? value : "";
}

function hashIp(req) {
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

function respond(res, nativeForm, status, payload) {
  if (nativeForm) {
    res.statusCode = 303;
    res.setHeader("Location", payload.ok ? REDIRECTS.success : REDIRECTS.error);
    return res.end();
  }

  return res.status(status).json(payload);
}

function fail(res, nativeForm, status, error, extra) {
  return respond(res, nativeForm, status, { ok: false, error, ...extra });
}
