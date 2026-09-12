import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "./app.mjs";
import { openStore, hashPassword, now, secret } from "./store.mjs";
import { parseProposal, prompts, providerConfig } from "./provider.mjs";

const origin = "https://workspace.test";
const proposal = {
  title: "First customer launch plan",
  kind: "launch-plan",
  instructions: "Write a concrete launch plan using the founder's constraints.",
  rationale: "Validate demand before building.",
};
async function fixture(t, complete) {
  const directory = mkdtempSync(join(tmpdir(), "soloop-test-"));
  let store = openStore(join(directory, "test.db"));
  const password = secret();
  const userId = randomUUID();
  const secondId = randomUUID();
  const hash = await hashPassword(password);
  store.run("INSERT INTO users VALUES(?,?,?,?)", userId, "owner", hash, now());
  store.run(
    "INSERT INTO users VALUES(?,?,?,?)",
    secondId,
    "second",
    hash,
    now(),
  );
  const calls = [];
  const provider = {
    ready: true,
    model: "gpt-5.6-sol",
    complete: async (...args) => {
      calls.push(args);
      return complete
        ? complete(...args)
        : args[1].json
          ? JSON.stringify(proposal)
          : "# A useful result\n\nStart with five customer conversations.";
    },
  };
  let app;
  let base;
  async function start() {
    app = await createApp({ store, provider, origin });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(
    path,
    { method = "GET", data, auth, headers = {} } = {},
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(auth ? { Cookie: auth.cookie, "X-CSRF-Token": auth.csrf } : {}),
        ...(method !== "GET"
          ? { Origin: origin, "Content-Type": "application/json" }
          : {}),
        ...headers,
      },
      ...(method !== "GET"
        ? { body: typeof data === "string" ? data : JSON.stringify(data || {}) }
        : {}),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json(),
    };
  }
  async function login(username = "owner", candidate = password) {
    const result = await request("/auth/login", {
      method: "POST",
      data: { username, password: candidate },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return {
      cookie: result.headers.get("set-cookie").split(";")[0],
      csrf: result.body.csrf,
      headers: result.headers,
    };
  }
  async function project(auth, name = "Weekend Studio") {
    const result = await request("/projects", {
      method: "POST",
      auth,
      data: {
        name,
        brief:
          "A scheduling tool for independent design studios. Budget: $100, validate first.",
        url: "",
      },
    });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.project;
  }
  async function settled(projectId, auth) {
    for (let i = 0; i < 100; i++) {
      const result = await request(`/projects/${projectId}`, { auth });
      if (!result.body.runs.some((run) => run.status === "running"))
        return result.body;
      await delay(10);
    }
    assert.fail("Task did not finish");
  }
  return {
    get store() {
      return store;
    },
    request,
    login,
    project,
    settled,
    calls,
    password,
    userId,
    async restart() {
      await app.close();
      store.close();
      store = openStore(join(directory, "test.db"));
      await start();
    },
  };
}

test("authentication enforces origin, CSRF, secure cookies, expiry, logout and rotation", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/projects")).status, 401);
  for (const foreign of ["https://evil.test", "null", ""])
    assert.equal(
      (
        await f.request("/auth/login", {
          method: "POST",
          data: { username: "owner", password: f.password },
          headers: { Origin: foreign },
        })
      ).status,
      403,
    );
  const wrong = await f.request("/auth/login", {
    method: "POST",
    data: { username: "owner", password: "incorrect" },
  });
  const unknown = await f.request("/auth/login", {
    method: "POST",
    data: { username: "unknown", password: "incorrect" },
  });
  assert.deepEqual(wrong.body, unknown.body);
  const a = await f.login();
  const b = await f.login();
  assert.match(
    a.headers.get("set-cookie"),
    /__Host-soloop_session=.*HttpOnly; SameSite=Strict; Max-Age=604800; Secure/,
  );
  assert.equal(a.headers.get("cache-control"), "no-store");
  assert.equal(
    (await f.request("/projects", { method: "POST", auth: { ...a, csrf: "" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request("/projects", {
        method: "POST",
        auth: a,
        headers: { "Content-Type": "text/plain" },
      })
    ).status,
    415,
  );
  const rotated = await f.request("/auth/password", {
    method: "POST",
    auth: a,
    data: {
      currentPassword: f.password,
      newPassword: "a different secure password",
    },
  });
  assert.equal(rotated.status, 200);
  assert.equal((await f.request("/auth/session", { auth: b })).status, 401);
  assert.equal((await f.request("/auth/session", { auth: a })).status, 401);
  const c = await f.login("owner", "a different secure password");
  assert.equal(
    (await f.request("/auth/logout", { method: "POST", auth: c })).status,
    200,
  );
  assert.equal((await f.request("/auth/session", { auth: c })).status, 401);
  const d = await f.login("owner", "a different secure password");
  f.store.run("UPDATE sessions SET expires_at=0");
  assert.equal((await f.request("/auth/session", { auth: d })).status, 401);
});

test("login throttles persist across API restarts", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 15; i++)
    assert.equal(
      (
        await f.request("/auth/login", {
          method: "POST",
          data: { username: "owner", password: "incorrect" },
        })
      ).status,
      401,
    );
  await f.restart();
  assert.equal(
    (
      await f.request("/auth/login", {
        method: "POST",
        data: { username: "owner", password: f.password },
      })
    ).status,
    429,
  );
});

test("owner isolation, proposal approval, document conflicts and persistence", async (t) => {
  const f = await fixture(t);
  const a = await f.login();
  const b = await f.login("second");
  const p = await f.project(a);
  assert.deepEqual(
    (await f.request("/projects", { auth: b })).body.projects,
    [],
  );
  assert.equal((await f.request(`/projects/${p.id}`, { auth: b })).status, 404);
  assert.equal(
    (
      await f.request(`/projects/${p.id}`, {
        method: "PATCH",
        auth: b,
        data: { ...p, name: "Stolen" },
      })
    ).status,
    404,
  );
  const planKey = randomUUID();
  assert.equal(
    (
      await f.request(`/projects/${p.id}/plan`, {
        method: "POST",
        auth: a,
        data: { requestId: planKey },
      })
    ).status,
    202,
  );
  let state = await f.settled(p.id, a);
  const action = state.actions[0];
  assert.equal(action.title, proposal.title);
  assert.equal(
    (
      await f.request(`/projects/${p.id}/actions/${action.id}/approve`, {
        method: "POST",
        auth: b,
        data: { requestId: randomUUID() },
      })
    ).status,
    404,
  );
  const key = randomUUID();
  const route = `/projects/${p.id}/actions/${action.id}/approve`;
  const replies = await Promise.all(
    [1, 2].map(() =>
      f.request(route, { method: "POST", auth: a, data: { requestId: key } }),
    ),
  );
  assert.equal(replies[0].body.run.id, replies[1].body.run.id);
  state = await f.settled(p.id, a);
  assert.equal(state.artifacts.length, 1);
  assert.equal(f.calls.length, 2);
  assert.equal(
    (
      await f.request(route, {
        method: "POST",
        auth: a,
        data: { requestId: randomUUID() },
      })
    ).status,
    409,
  );
  const artifact = state.artifacts[0];
  const patch = {
    content: "# Owner edited document\n\nReady to use.",
    version: artifact.version,
  };
  assert.equal(
    (
      await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, {
        method: "PATCH",
        auth: b,
        data: patch,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, {
        method: "PATCH",
        auth: a,
        data: patch,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, {
        method: "PATCH",
        auth: a,
        data: patch,
      })
    ).status,
    409,
  );
  await f.restart();
  state = (await f.request(`/projects/${p.id}`, { auth: a })).body;
  assert.equal(
    (await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, { auth: a }))
      .body.artifact.content,
    patch.content,
  );
  assert.equal(state.artifacts[0].version, 2);
  assert.equal(
    (await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, { auth: b }))
      .status,
    404,
  );
  const chinese = "测试文档".repeat(12500);
  assert.equal(
    (
      await f.request(`/projects/${p.id}/artifacts/${artifact.id}`, {
        method: "PATCH",
        auth: a,
        data: { content: chinese, version: 2 },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await f.request(`/projects/${p.id}/runs/${state.runs[0].id}/cancel`, {
        method: "POST",
        auth: b,
      })
    ).status,
    404,
  );
});

test("one project run, payload-aware idempotency, cancellation and late output", async (t) => {
  let release;
  const f = await fixture(
    t,
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const a = await f.login();
  const p = await f.project(a);
  const key = randomUUID();
  const start = () =>
    f.request(`/projects/${p.id}/chat`, {
      method: "POST",
      auth: a,
      data: { requestId: key, content: "Help me validate this idea" },
    });
  const results = await Promise.all([start(), start()]);
  assert.equal(results[0].body.run.id, results[1].body.run.id);
  assert.equal(f.calls.length, 1);
  assert.equal(
    (
      await f.request(`/projects/${p.id}/chat`, {
        method: "POST",
        auth: a,
        data: { requestId: key, content: "Changed input" },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(`/projects/${p.id}/plan`, {
        method: "POST",
        auth: a,
        data: { requestId: randomUUID() },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await f.request(
        `/projects/${p.id}/runs/${results[0].body.run.id}/cancel`,
        { method: "POST", auth: a },
      )
    ).status,
    200,
  );
  release("Late output must not be saved");
  await delay(20);
  const state = await f.settled(p.id, a);
  assert.equal(state.runs[0].status, "cancelled");
  assert.equal(state.messages.length, 1);
  assert.equal(state.messages[0].role, "user");
});

test("failed/interrupted tasks are recoverable and private provider errors stay private", async (t) => {
  const f = await fixture(t, async () => {
    throw new Error("super-private-provider-value");
  });
  const a = await f.login();
  const p = await f.project(a);
  await f.request(`/projects/${p.id}/chat`, {
    method: "POST",
    auth: a,
    data: { requestId: randomUUID(), content: "A useful question" },
  });
  let state = await f.settled(p.id, a);
  assert.equal(state.runs[0].status, "failed");
  assert(!JSON.stringify(state).includes("super-private"));
  f.store.run(
    "INSERT INTO runs(id,project_id,request_id,request_hash,kind,status,created_at) VALUES(?,?,?,?,?,?,?)",
    randomUUID(),
    p.id,
    randomUUID(),
    "fixture",
    "plan",
    "running",
    now(),
  );
  await f.restart();
  state = await f.settled(p.id, a);
  assert.equal(state.runs[0].status, "failed");
  assert.match(state.runs[0].error, /restarted/);
});

test("provider prompts have bounded context and only allowed deliverables/models", () => {
  assert.throws(() => providerConfig({ SOLOOP_MODEL: "claude-unknown" }));
  assert.throws(() => providerConfig({ FOUNDRY_RESOURCE: "evil.test/path" }));
  assert.throws(() => providerConfig({ FOUNDRY_DEPLOYMENT: "invalid/path" }));
  assert.equal(providerConfig({ FOUNDRY_DEPLOYMENT: "my-openai-deployment" }).deployment, "my-openai-deployment");
  assert.throws(() =>
    parseProposal(JSON.stringify({ ...proposal, kind: "deploy-code" })),
  );
  assert.throws(() => parseProposal("not JSON"));
  const messages = Array.from({ length: 24 }, () => ({
    role: "user",
    content: "x".repeat(12000),
  }));
  const context = prompts(
    { name: "Test", brief: "A product", url: "https://example.com" },
    messages,
    "chat",
  );
  assert(context.map((message) => message.content).join("").length < 63000);
  assert.match(context[0].content, /NO browsing/);
});

test("an in-flight login cannot survive password reset", async (t) => {
  const f = await fixture(t);
  const replacement = await hashPassword(secret());
  const originalGet = f.store.get;
  let reset = false;
  f.store.get = (sql, ...args) => {
    const result = originalGet(sql, ...args);
    if (!reset && sql === "SELECT * FROM users WHERE username=?") {
      reset = true;
      setImmediate(() =>
        f.store.run(
          "UPDATE users SET password_hash=? WHERE id=?",
          replacement,
          f.userId,
        ),
      );
    }
    return result;
  };
  const result = await f.request("/auth/login", {
    method: "POST",
    data: { username: "owner", password: f.password },
  });
  assert.equal(result.status, 401);
  assert.equal(f.store.get("SELECT count(*) AS n FROM sessions").n, 0);
});

test("task rate limits are enforced and old messages remain retrievable", async (t) => {
  const f = await fixture(t);
  const a = await f.login();
  const p = await f.project(a);
  for (let i = 0; i < 60; i++)
    f.store.run(
      "INSERT INTO runs(id,project_id,request_id,request_hash,kind,status,created_at) VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      p.id,
      randomUUID(),
      "fixture",
      "chat",
      "succeeded",
      now(),
    );
  assert.equal(
    (
      await f.request(`/projects/${p.id}/chat`, {
        method: "POST",
        auth: a,
        data: { requestId: randomUUID(), content: "Try too many tasks" },
      })
    ).status,
    429,
  );
  for (let i = 0; i < 205; i++)
    f.store.run(
      "INSERT INTO messages VALUES(?,?,?,?,?)",
      randomUUID(),
      p.id,
      "user",
      `Message ${i}`,
      now(),
    );
  const state = (await f.request(`/projects/${p.id}`, { auth: a })).body;
  assert.equal(state.messages.length, 200);
  const older = await f.request(
    `/projects/${p.id}?before=${state.messages[0].sequence}`,
    { auth: a },
  );
  assert.equal(older.body.messages.length, 5);
  assert.equal(older.body.messages[0].content, "Message 0");
});
