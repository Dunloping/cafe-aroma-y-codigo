import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/contact.js";
import { validateContact } from "../lib/validation.js";

// The endpoint must fail gracefully (500, no crash) when no database is bound.
delete process.env.DATABASE_URL;

const validBody = {
  motivo: "consulta",
  nombre: "Ana Gómez",
  correo: "ana@ejemplo.com",
  telefono: "+54 11 5555 0123",
  mensaje: "Quería consultar por la mesa larga del fondo.",
  consent: "on",
};

function createRequest({ method = "POST", body = {}, headers = {} } = {}) {
  return {
    method,
    body,
    headers: { "content-type": "application/json", ...headers },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

function createResponse() {
  const state = { statusCode: 200, headers: {}, body: undefined, ended: false };

  const res = {
    set statusCode(value) {
      state.statusCode = value;
    },
    get statusCode() {
      return state.statusCode;
    },
    setHeader(name, value) {
      state.headers[name.toLowerCase()] = value;
    },
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(payload) {
      state.body = payload;
      state.ended = true;
      return res;
    },
    end() {
      state.ended = true;
      return res;
    },
  };

  return { res, state };
}

test("rejects methods other than POST", async () => {
  const { res, state } = createResponse();
  await handler(createRequest({ method: "GET" }), res);

  assert.equal(state.statusCode, 405);
  assert.equal(state.headers.allow, "POST, OPTIONS");
  assert.equal(state.body.error, "method_not_allowed");
});

test("returns field errors for an invalid payload", async () => {
  const { res, state } = createResponse();
  await handler(
    createRequest({
      body: {
        motivo: "publicidad",
        nombre: "A",
        correo: "no-es-un-correo",
        mensaje: "corto",
        consent: false,
      },
    }),
    res
  );

  assert.equal(state.statusCode, 400);
  assert.equal(state.body.error, "validation_error");
  assert.deepEqual(Object.keys(state.body.fields).sort(), [
    "consent",
    "correo",
    "mensaje",
    "motivo",
    "nombre",
  ]);
});

test("honeypot submissions are silently accepted", async () => {
  const { res, state } = createResponse();
  await handler(createRequest({ body: { ...validBody, website: "spam" } }), res);

  assert.equal(state.statusCode, 201);
  assert.deepEqual(state.body, { ok: true, id: null });
});

test("valid submission without DATABASE_URL fails gracefully", async () => {
  const { res, state } = createResponse();
  await handler(createRequest({ body: validBody }), res);

  assert.equal(state.statusCode, 500);
  assert.equal(state.body.error, "server_error");
  assert.match(state.body.message, /Intentá de nuevo/);
});

test("native form submissions redirect back to the page", async () => {
  const { res, state } = createResponse();
  await handler(
    createRequest({
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: { ...validBody, website: "spam" },
    }),
    res
  );

  assert.equal(state.statusCode, 303);
  assert.equal(state.headers.location, "/?enviado=1#contacto");
  assert.equal(state.ended, true);
});

test("oversized payloads are rejected before validation", async () => {
  const { res, state } = createResponse();
  await handler(
    createRequest({ body: { ...validBody, mensaje: "x".repeat(9_000) } }),
    res
  );

  assert.equal(state.statusCode, 413);
  assert.equal(state.body.error, "payload_too_large");
});

test("validateContact normalizes input", () => {
  const result = validateContact({
    motivo: "  Reserva ",
    nombre: "  Ana   Gómez ",
    correo: " Ana@Ejemplo.COM ",
    telefono: " ",
    mensaje: "  Hola,   quiero reservar una mesa.  ",
    consent: "on",
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.data, {
    motivo: "reserva",
    nombre: "Ana Gómez",
    correo: "ana@ejemplo.com",
    telefono: null,
    mensaje: "Hola, quiero reservar una mesa.",
  });
});

test("validateContact rejects malformed phone numbers", () => {
  const result = validateContact({ ...validBody, telefono: "llamame" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.telefono);
});
