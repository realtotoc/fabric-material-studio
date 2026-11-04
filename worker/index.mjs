import { timingSafeEqual } from "node:crypto";
import { handleApi } from "../server/ai.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/healthz") {
      return Response.json({ status: "ok" });
    }
    if (!env.STUDIO_PASSWORD) {
      return new Response("Configure the STUDIO_PASSWORD Worker secret first.", {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const expected = Buffer.from(
      `${env.STUDIO_USER || "admin"}:${env.STUDIO_PASSWORD}`,
    );
    let actual = Buffer.alloc(0);
    const header = request.headers.get("authorization") || "";
    if (header.startsWith("Basic ")) {
      try {
        actual = Buffer.from(header.slice(6), "base64");
      } catch {
        // Invalid credentials receive the same challenge as absent credentials.
      }
    }
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      return new Response("Authentication required", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Fabric Studio", charset="UTF-8"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405 });
    }
    return env.ASSETS.fetch(request);
  },
};
