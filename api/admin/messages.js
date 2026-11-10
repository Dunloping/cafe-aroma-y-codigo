import { isAuthenticated } from "../../lib/auth.js";
import { getPool } from "../../lib/db.js";
import { parseBody } from "../../lib/http.js";

const ESTADOS = ["nuevo", "leido", "respondido"];
const MOTIVOS = ["reserva", "consulta", "sugerencia"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const COLUMNS = `id, motivo, nombre, correo, telefono, mensaje, estado, creado_en`;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!process.env.ADMIN_SESSION_SECRET) {
    console.error("Admin messages: ADMIN_SESSION_SECRET is not configured.");
    return res.status(503).json({
      ok: false,
      error: "admin_not_configured",
      message: "El panel todavía no está configurado.",
    });
  }

  if (!isAuthenticated(req)) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
      message: "Tu sesión expiró. Volvé a iniciar sesión.",
    });
  }

  if (req.method === "GET") {
    return listMessages(req, res);
  }

  if (req.method === "PATCH") {
    return updateMessage(req, res);
  }

  res.setHeader("Allow", "GET, PATCH");
  return res.status(405).json({ ok: false, error: "method_not_allowed" });
}

async function listMessages(req, res) {
  const query = req.query || {};
  const estado = String(query.estado || "").trim();
  const motivo = String(query.motivo || "").trim();
  const search = String(query.q || "").trim().slice(0, 80);
  const limit = clampLimit(query.limit);

  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ ok: false, error: "invalid_filter" });
  }

  if (motivo && !MOTIVOS.includes(motivo)) {
    return res.status(400).json({ ok: false, error: "invalid_filter" });
  }

  const conditions = [];
  const params = [];

  if (estado) {
    params.push(estado);
    conditions.push(`estado = $${params.length}`);
  }

  if (motivo) {
    params.push(motivo);
    conditions.push(`motivo = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    const index = params.length;
    conditions.push(
      `(nombre ILIKE $${index} OR correo ILIKE $${index} OR mensaje ILIKE $${index})`
    );
  }

  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  try {
    const pool = getPool();

    const [{ rows: items }, { rows: stateRows }] = await Promise.all([
      pool.query(
        `select ${COLUMNS}
           from contact_messages
           ${where}
          order by creado_en desc
          limit $${params.length + 1}`,
        [...params, limit]
      ),
      pool.query(
        `select estado, count(*)::int as total
           from contact_messages
          group by estado`
      ),
    ]);

    const stats = { total: 0, nuevo: 0, leido: 0, respondido: 0 };
    for (const row of stateRows) {
      stats[row.estado] = row.total;
      stats.total += row.total;
    }

    return res.status(200).json({ ok: true, items, stats });
  } catch (error) {
    return databaseError(res, error, "list");
  }
}

async function updateMessage(req, res) {
  if (!isSameOrigin(req)) {
    return res.status(403).json({ ok: false, error: "forbidden_origin" });
  }

  const body = parseBody(req.body);
  const id = Number(body && body.id);
  const estado = String((body && body.estado) || "").trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: "invalid_id" });
  }

  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ ok: false, error: "invalid_estado" });
  }

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `update contact_messages
          set estado = $1
        where id = $2
        returning ${COLUMNS}`,
      [estado, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }

    return res.status(200).json({ ok: true, item: rows[0] });
  } catch (error) {
    return databaseError(res, error, "update");
  }
}

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

function isSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;

  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function databaseError(res, error, action) {
  if (error.code === "DB_NOT_CONFIGURED") {
    console.error(`Admin messages (${action}): DATABASE_URL is not configured.`);
  } else {
    console.error(`Admin messages (${action}) failed:`, error.code || error.name, error.message);
  }

  return res.status(500).json({
    ok: false,
    error: "server_error",
    message: "No pudimos leer los mensajes. Intentá de nuevo.",
  });
}
