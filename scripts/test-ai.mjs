import { strict as assert } from "node:assert";
import {
  handleApi,
  parseParts,
  normalizePolygon,
  BASE,
} from "../server/ai.mjs";
const image = "data:image/png;base64,iVBORw0KGgo=";
const req = (path, data, origin = "https://studio.example") =>
  new Request("https://studio.example/api/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(data),
  });
const ENV = { AIHUBMIX_API_KEY: "test-server-secret" };
let calls = [];
const mock = async (url, init) => {
  calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
  return new Response(
    JSON.stringify({
      id: "task_real",
      status: "completed",
      output: [
        { content_url: BASE + "/ai/v1/images/task_real/content/result_real" },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
let r = await handleApi(
  req("generate", {
    image,
    material: image,
    model: "qwen-image-3.0",
    apiKey: "frontend-must-not-work",
  }),
  {},
  mock,
);
assert.equal(r.status, 503);
assert.equal(calls.length, 0);
r = await handleApi(
  req("generate", { apiKey: "secret", image, material: image, model: "other" }),
  ENV,
  mock,
);
assert.equal(r.status, 400);
assert.equal(calls.length, 0);
r = await handleApi(
  req(
    "generate",
    { apiKey: "secret", image, material: image, model: "qwen-image-3.0" },
    "https://attacker.example",
  ),
  ENV,
  mock,
);
assert.equal(r.status, 403);
assert.equal(calls.length, 0);
r = await handleApi(
  req("generate", {
    apiKey: "secret",
    image,
    material: image,
    guide: image,
    model: "qwen-image-3.0",
    parts: [{ label: "靠背", description: "backrest" }],
  }),
  ENV,
  mock,
);
assert.equal(r.status, 200);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, BASE + "/ai/v1/images/generations");
assert.equal(calls[0].body.images.length, 3);
assert.equal(calls[0].body.n, 1);
assert.equal(calls[0].body.async, true);
assert.match(calls[0].body.prompt, /靠背/);
assert.match(calls[0].body.prompt, /NEVER part of the output color/);
assert.equal(calls[0].body.mask, undefined);
assert.equal(calls[0].init.headers.Authorization, "Bearer test-server-secret");
let retries = 0;
r = await handleApi(
  req("generate", {
    apiKey: "secret",
    image,
    material: image,
    model: "qwen-image-3.0",
  }),
  ENV,
  async () => {
    retries++;
    return new Response(
      JSON.stringify({ error: { code: "insufficient_user_quota" } }),
      { status: 403 },
    );
  },
);
assert.equal(r.status, 403);
assert.equal(retries, 1);
assert.match((await r.json()).error, /insufficient_user_quota/);
calls = [];
for (const url of [
  "https://evil.example/steal",
  "https://aihubmix.com.evil.example/ai/v1/images/task_x/content/result_x",
  "http://169.254.169.254/",
  "https://aihubmix.com/ai/v1/images/x/content/y?redirect=evil",
]) {
  r = await handleApi(req("result", { apiKey: "secret", url }), ENV, mock);
  assert.equal(r.status, 400);
}
assert.equal(calls.length, 0);
const parsed = parseParts(
  '```json\n{"furniture":"沙发","parts":[{"label":"坐垫","polygon":[[-5,0],[500,0],[500,1200]]}]}\n```',
);
assert.deepEqual(parsed.parts[0].polygon, [
  [0, 0],
  [500, 0],
  [500, 1000],
]);
assert.throws(() => parseParts('{"parts":null}'));
r = await handleApi(
  req("analyze", { apiKey: "secret", image }),
  ENV,
  async (url, init) => {
    assert.equal(url, BASE + "/v1/chat/completions");
    const b = JSON.parse(init.body);
    assert.equal(b.model, "qwen3-vl-plus");
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"furniture":"沙发","parts":[{"label":"坐垫","polygon":[[0,0],[500,0],[500,500]]}]}',
            },
          },
        ],
        usage: { prompt_tokens: 100 },
      }),
    );
  },
);
assert.equal(r.status, 200);
assert.equal((await r.json()).parts[0].label, "坐垫");
r = await handleApi(
  req("task", { apiKey: "secret", id: "task_live" }),
  ENV,
  async () =>
    new Response(
      JSON.stringify({ id: "task_live", status: "in_progress", output: [] }),
    ),
);
assert.equal((await r.json()).status, "in_progress");
r = await handleApi(
  req("generate", { image, material: image, model: "qwen-image-3.0" }),
  { AIHUBMIX_API_KEY: "server-secret" },
  async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer server-secret");
    return mock(url, init);
  },
);
assert.equal(r.status, 200);
console.log(
  "AI contract checks passed: key handling, origin, model allowlist, image forwarding, region prompt, no automatic retry, result URL protection, structured regions and task recovery.",
);

assert.deepEqual(normalizePolygon([[46, 412, 208, 452, 208, 792, 63, 772]]), [
  [46, 412],
  [208, 452],
  [208, 792],
  [63, 772],
]);
assert.deepEqual(normalizePolygon([100, 200, 300, 200, 300, 400]), [
  [100, 200],
  [300, 200],
  [300, 400],
]);
assert.deepEqual(
  normalizePolygon([
    { x: 100, y: 200 },
    { x: 300, y: 200 },
    { x: 300, y: 400 },
  ]),
  [
    [100, 200],
    [300, 200],
    [300, 400],
  ],
);

r = await handleApi(
  req("task", { id: "task_failed" }),
  ENV,
  async () =>
    new Response(
      JSON.stringify({
        id: "task_failed",
        status: "failed",
        output: [],
        error: { code: "upstream_rejected" },
      }),
    ),
);
assert.equal(r.status, 200);
assert.equal((await r.json()).error.code, "upstream_rejected");
