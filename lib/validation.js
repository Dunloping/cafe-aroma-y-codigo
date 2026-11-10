export const MOTIVOS = ["reserva", "consulta", "sugerencia"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+()\d\s.-]{6,30}$/;

const LIMITS = {
  nombre: 80,
  correo: 120,
  telefono: 30,
  mensaje: 1000,
};

function asText(value) {
  return typeof value === "string" ? value : "";
}

function normalize(value) {
  return asText(value).replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function normalizeMessage(value) {
  return asText(value)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isTruthy(value) {
  return value === true || value === "true" || value === "on" || value === 1;
}

/**
 * Normalizes and validates the contact form payload.
 * Returns plain data ready to bind into a parameterized SQL query.
 */
export function validateContact(input = {}) {
  const errors = {};

  const motivo = normalize(input.motivo).toLowerCase();
  const nombre = normalize(input.nombre);
  const correo = normalize(input.correo).toLowerCase();
  const telefono = normalize(input.telefono);
  const mensaje = normalizeMessage(input.mensaje);
  const consent = isTruthy(input.consent);

  if (!MOTIVOS.includes(motivo)) {
    errors.motivo = "Elegí un motivo válido.";
  }

  if (nombre.length < 2 || nombre.length > LIMITS.nombre) {
    errors.nombre = "Ingresá tu nombre (entre 2 y 80 caracteres).";
  }

  if (
    correo.length > LIMITS.correo ||
    !EMAIL_PATTERN.test(correo)
  ) {
    errors.correo = "Ingresá un correo electrónico válido.";
  }

  if (telefono && !PHONE_PATTERN.test(telefono)) {
    errors.telefono = "Ingresá un teléfono válido o dejá el campo vacío.";
  }

  if (mensaje.length < 10 || mensaje.length > LIMITS.mensaje) {
    errors.mensaje = "Escribí un mensaje de entre 10 y 1000 caracteres.";
  }

  if (!consent) {
    errors.consent = "Necesitamos tu consentimiento para responderte.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    data: {
      motivo,
      nombre,
      correo,
      telefono: telefono || null,
      mensaje,
    },
    errors,
  };
}
