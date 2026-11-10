import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionToken,
  hashPassword,
  isAuthenticated,
  readCookie,
  verifyPassword,
  verifySessionToken,
} from "../lib/auth.js";

process.env.ADMIN_SESSION_SECRET = "s".repeat(48);

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

test("password hash round-trips with a fixed salt", () => {
  const stored = hashPassword("clave-segura", "sal-fija");

  assert.equal(verifyPassword("clave-segura", stored), true);
  assert.equal(verifyPassword("otra-clave", stored), false);
  assert.equal(verifyPassword("clave-segura", "formato-invalido"), false);
  assert.equal(verifyPassword("", stored), false);
});

test("session token is valid until it expires", () => {
  const token = createSessionToken(1_000);

  assert.equal(verifySessionToken(token, 2_000), true);
  assert.equal(verifySessionToken(token, 1_000 + SESSION_TTL_MS - 1), true);
  assert.equal(verifySessionToken(token, 1_000 + SESSION_TTL_MS + 1), false);
});

test("tampered session tokens are rejected", () => {
  const token = createSessionToken();
  const [expires, signature] = token.split(".");
  const lastChar = signature.slice(-1);
  const tampered = `${expires}.${signature.slice(0, -1)}${lastChar === "0" ? "1" : "0"}`;

  assert.equal(verifySessionToken(tampered), false);
  assert.equal(verifySessionToken(`${expires}.`), false);
  assert.equal(verifySessionToken("no-es-un-token"), false);
});

test("cookies are read from the request header", () => {
  const token = createSessionToken();

  const request = {
    headers: { cookie: `theme=dark; ac_admin=${token}` },
  };

  assert.equal(readCookie(request), token);
  assert.equal(isAuthenticated(request), true);
  assert.equal(isAuthenticated({ headers: {} }), false);
});
