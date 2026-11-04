import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Readable } from "node:stream";
import { timingSafeEqual } from "node:crypto";
import { handleApi } from "./ai.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = path.join(root, "public");
const port = Number(process.env.PORT || 4173);
const production = process.env.NODE_ENV === "production";
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
if (production && !process.env.STUDIO_PASSWORD)
  throw new Error("Set STUDIO_PASSWORD for your hosted test website.");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".md": "text/plain; charset=utf-8",
};
async function environment() {
  let env = { AIHUBMIX_API_KEY: process.env.AIHUBMIX_API_KEY || "" };
  if (!production) {
    try {
      const vars = parseEnv(
        await readFile(path.join(root, ".dev.vars"), "utf8"),
      );
      if (vars.AIHUBMIX_API_KEY) env.AIHUBMIX_API_KEY = vars.AIHUBMIX_API_KEY;
    } catch {}
  }
  return env;
}
const server = http.createServer(async (req, res) => {
  try {
    if (
      !production &&
      !["127.0.0.1:" + port, "localhost:" + port].includes(req.headers.host)
    ) {
      res.writeHead(403);
      res.end("Local access only");
      return;
    }
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"status":"ok"}');
      return;
    }
    if (process.env.STUDIO_PASSWORD) {
      const expected = Buffer.from(
        (process.env.STUDIO_USER || "admin") +
          ":" +
          process.env.STUDIO_PASSWORD,
      );
      let actual = Buffer.alloc(0);
      try {
        if (req.headers.authorization?.startsWith("Basic "))
          actual = Buffer.from(req.headers.authorization.slice(6), "base64");
      } catch {}
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        res.writeHead(401, {
          "WWW-Authenticate": 'Basic realm="Fabric Studio", charset="UTF-8"',
          "Cache-Control": "no-store",
        });
        res.end("Authentication required");
        return;
      }
    }
    const scheme =
      production &&
      req.headers["x-forwarded-proto"]?.split(",")[0].trim() === "https"
        ? "https"
        : "http";
    const url = new URL(req.url, scheme + "://" + req.headers.host);
    if (url.pathname.startsWith("/api/")) {
      let chunks = [],
        length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 22_000_000) {
          res.writeHead(413);
          res.end("Request too large");
          return;
        }
        chunks.push(chunk);
      }
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(req.method !== "GET" && req.method !== "HEAD"
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await handleApi(request, await environment());
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) Readable.fromWeb(response.body).pipe(res);
      else res.end();
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    if (pathname.split("/").some((part) => part.startsWith("."))) {
      res.writeHead(404);
      res.end();
      return;
    }
    const file = path.resolve(publicRoot, "." + pathname);
    if (!file.startsWith(publicRoot + path.sep)) {
      res.writeHead(404);
      res.end();
      return;
    }
    if (!(await stat(file)).isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Content-Length": bytes.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    if (!res.headersSent) res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, host, () =>
  console.log(
    "Fabric Studio listening on " +
      host +
      ":" +
      port +
      "; AI keys stay on the server.",
  ),
);
