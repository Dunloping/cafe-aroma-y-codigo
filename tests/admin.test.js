import test from "node:test";
import assert from "node:assert/strict";
import loginHandler from "../api/admin/login.js";
import logoutHandler from "../api/admin/logout.js";
import messagesHandler from "../api/admin/messages.js";
import { createSessionToken, hashPassword } from "../lib/auth.js";

process.env.ADMIN_SESSION_SECRET = "s".repeat(48);
process.env.ADMIN_PASSWORD_HASH = hashPassword("clave-de-prueba", "sal-fija");
delete process.env.DATABASE_URL;

const cookie = `ac_admin=${createSessionToken()}`;

function createRequest({ method = "GET", body = {}, headers = {}, query = {} } = {}) {
  return {
    method,
    body,
    query,
    headers: { host: "localhost:3000", ...headers },
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

test("admin messages require a session", async () => {
  const { res, state } = createResponse();
  await messagesHandler(createRequest(), res);

  assert.equal(state.statusCode, 401);
  assert.equal(state.body.error, "unauthorized");
});

test("admin updates require a session", async () => {
  const { res, state } = createResponse();
  await messagesHandler(
    createRequest({ method: "PATCH", body: { id: 1, estado: "leido" } }),
    res
  );

  assert.equal(state.statusCode, 401);
});

test("invalid estado is rejected before touching the database", async () => {
  const { res, state } = createResponse();
  await messagesHandler(
    createRequest({
      method: "PATCH",
      headers: { cookie },
      body: { id: 1, estado: "archivado" },
    }),
    res
  );

  assert.equal(state.statusCode, 400);
  assert.equal(state.body.error, "invalid_estado");
});

test("cross-origin updates are forbidden", async () => {
  const { res, state } = createResponse();
  await messagesHandler(
    createRequest({
      method: "PATCH",
      headers: { cookie, origin: "https://evil.example" },
      body: { id: 1, estado: "leido" },
    }),
    res
  );

  assert.equal(state.statusCode, 403);
  assert.equal(state.body.error, "forbidden_origin");
});

test("listing without DATABASE_URL fails gracefully", async () => {
  const { res, state } = createResponse();
  await messagesHandler(createRequest({ headers: { cookie } }), res);

  assert.equal(state.statusCode, 500);
  assert.equal(state.body.error, "server_error");
});

test("login rejects a missing password", async () => {
  const { res, state } = createResponse();
  await loginHandler(createRequest({ method: "POST", body: {} }), res);

  assert.equal(state.statusCode, 400);
  assert.equal(state.body.error, "missing_password");
});

test("login rejects a wrong password", async () => {
  const { res, state } = createResponse();
  await loginHandler(
    createRequest({ method: "POST", body: { password: "incorrecta" } }),
    res
  );

  assert.equal(state.statusCode, 401);
  assert.equal(state.body.error, "invalid_credentials");
  assert.equal(state.headers["set-cookie"], undefined);
});

test("login sets an HttpOnly session cookie", async () => {
  const { res, state } = createResponse();
  await loginHandler(
    createRequest({ method: "POST", body: { password: "clave-de-prueba" } }),
    res
  );

  assert.equal(state.statusCode, 200);
  const setCookie = state.headers["set-cookie"];
  assert.match(setCookie, /^ac_admin=\d+\.[a-f0-9]+;/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
});

test("logout clears the cookie", async () => {
  const { res, state } = createResponse();
  await logoutHandler(createRequest({ method: "POST" }), res);

  assert.equal(state.statusCode, 200);
  assert.match(state.headers["set-cookie"], /Max-Age=0/);
});
