import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Local development server for Windows, where `vercel dev` can fail with
 * EPERM when it tries to create symlinks in its build cache.
 *
 * It serves index.html + css/ + js/ and runs the real /api/contact handler,
 * so the form writes to the PostgreSQL database configured in .env.local.
 *
 * Usage: npm run dev:local
 */

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT || 3001);
const MAX_BODY_BYTES = 64 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname.startsWith("/api/")) {
    const route = url.pathname.slice("/api/".length);
    const allowed = new Set([
      "contact",
      "admin/login",
      "admin/logout",
      "admin/messages",
    ]);

    if (!allowed.has(route)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: false, error: "not_found" }));
    }

    const body = await readBody(req);
    if (body === null) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.end(JSON.stringify({ ok: false, error: "payload_too_large" }));
    }

    req.body = body;
    req.query = Object.fromEntries(url.searchParams);
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (payload) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
      return res;
    };

    try {
      const module = await import(`../api/${route}.js`);
      await module.default(req, res);
    } catch (error) {
      console.error("Local API error:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ ok: false, error: "server_error" }));
      }
    }
    return;
  }

  const filePath = resolveStatic(url.pathname);
  if (!filePath) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not found");
  }

  try {
    const file = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader(
      "Content-Type",
      MIME[path.extname(filePath)] || "application/octet-stream"
    );
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});

async function readBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

/** Only index.html, css/ and js/ are public; never .env, node_modules or api/. */
function resolveStatic(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (
    decoded === "/" ||
    decoded === "/index.html" ||
    decoded === "/admin.html" ||
    decoded === "/favicon.svg"
  ) {
    const file =
      decoded === "/admin.html"
        ? "admin.html"
        : decoded === "/favicon.svg"
          ? "favicon.svg"
          : "index.html";
    return path.join(root, file);
  }

  const relative = decoded.replace(/^\/+/, "");
  if (!relative.startsWith("css/") && !relative.startsWith("js/")) {
    return null;
  }

  const absolute = path.resolve(root, relative);
  return absolute.startsWith(root + path.sep) ? absolute : null;
}

server.listen(port, "127.0.0.1", () => {
  console.log(`Café Aroma & Código → http://127.0.0.1:${port}`);
});
