import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { digest, hashPassword, now, secret, verifyPassword } from "./store.mjs";
import { prompts, parseProposal } from "./provider.mjs";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, message) => {
  throw new HttpError(status, message);
};
const textField = (data, key, min, max) => {
  const value = data?.[key];
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max
  )
    fail(400, `${key} must be ${min}–${max} characters.`);
  return value.trim();
};
const idField = (data) => {
  const id = textField(data, "requestId", 36, 36);
  if (!/^[a-f0-9-]{36}$/.test(id)) fail(400, "Invalid request identifier.");
  return id;
};
const passwordField = (data, key, min = 1) => {
  const value = data?.[key];
  if (typeof value !== "string" || value.length < min || value.length > 256)
    fail(400, `Password must be ${min}–256 characters.`);
  return value;
};
const projectFields = (data) => {
  const name = textField(data, "name", 1, 100);
  const brief = textField(data, "brief", 10, 12000);
  const url = textField({ url: data.url ?? "" }, "url", 0, 2000);
  if (url) {
    try {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw new Error();
    } catch {
      fail(400, "Use a complete http or https URL without login details.");
    }
  }
  return { name, brief, url };
};

export async function createApp({
  store,
  provider,
  origin,
  secure = true,
  trustProxy = false,
}) {
  const originUrl = new URL(origin);
  if (
    originUrl.origin !== origin ||
    (secure && originUrl.protocol !== "https:")
  )
    throw new Error(
      "APP_ORIGIN must be an exact origin; production requires HTTPS.",
    );
  const cookieName = secure ? "__Host-soloop_session" : "soloop_session";
  const controls = new Map();
  let hashTasks = 0;
  const dummyHash = await hashPassword(secret());
  const authWork = async (fn) => {
    if (hashTasks >= 3)
      fail(429, "Too many sign-in requests. Try again shortly.");
    hashTasks++;
    try {
      return await fn();
    } finally {
      hashTasks--;
    }
  };
  store.transaction(() => {
    store.run("UPDATE actions SET status='failed' WHERE status='running'");
    store.run(
      "UPDATE runs SET status='failed', error=?, finished_at=? WHERE status='running'",
      "The service restarted before this task finished. Please try again.",
      now(),
    );
    store.run("DELETE FROM sessions WHERE expires_at<?", now());
  });

  function attempt(key, limit) {
    const timestamp = now();
    store.run("DELETE FROM auth_attempts WHERE expires_at<?", timestamp);
    const hashed = digest(key);
    const prior = store.get(
      "SELECT count FROM auth_attempts WHERE key=?",
      hashed,
    );
    if (prior?.count >= limit)
      fail(429, "Too many attempts. Please try again in 15 minutes.");
    store.run(
      "INSERT INTO auth_attempts(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      hashed,
      timestamp + 15 * 60 * 1000,
    );
  }

  function session(req) {
    const token = (req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      fail(401, "Please log in to continue.");
    const row = store.get(
      "SELECT u.id,u.username,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?",
      digest(token),
      now(),
    );
    if (!row) fail(401, "Your session has expired. Please log in again.");
    return { ...row, csrf: digest(`csrf:${token}`) };
  }
  const sessionCookie = (token, age = 604800) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure ? "; Secure" : ""}`;
  function newSession(res, userId) {
    const token = secret();
    store.run("DELETE FROM sessions WHERE expires_at<?", now());
    store.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      digest(token),
      userId,
      now() + 604800000,
    );
    res.setHeader("Set-Cookie", sessionCookie(token));
    return digest(`csrf:${token}`);
  }
  function ownProject(id, user) {
    const project = store.get(
      "SELECT * FROM projects WHERE id=? AND user_id=?",
      id,
      user.id,
    );
    if (!project) fail(404, "Project not found.");
    return project;
  }
  function detail(project) {
    return {
      project,
      messages: store.all(
        "SELECT * FROM (SELECT rowid AS sequence,* FROM messages WHERE project_id=? ORDER BY rowid DESC LIMIT 200) ORDER BY sequence",
        project.id,
      ),
      actions: store.all(
        "SELECT * FROM actions WHERE project_id=? ORDER BY created_at DESC",
        project.id,
      ),
      artifacts: store.all(
        "SELECT id,title,version,updated_at FROM artifacts WHERE project_id=? ORDER BY updated_at DESC",
        project.id,
      ),
      runs: store.all(
        "SELECT id,kind,action_id,status,error,created_at,finished_at FROM runs WHERE project_id=? ORDER BY created_at DESC LIMIT 50",
        project.id,
      ),
    };
  }
  async function execute(run, project, action) {
    const control = new AbortController();
    controls.set(run.id, control);
    try {
      const history = store.all(
        "SELECT * FROM (SELECT rowid AS sequence,role,content FROM messages WHERE project_id=? ORDER BY rowid DESC LIMIT 24) ORDER BY sequence",
        project.id,
      );
      const context = {
        documents: store
          .all(
            "SELECT title,content FROM artifacts WHERE project_id=? ORDER BY updated_at DESC LIMIT 3",
            project.id,
          )
          .map((item) => ({
            title: item.title,
            content: item.content.slice(0, 8000),
          })),
        proposals: store
          .all(
            "SELECT title,kind,instructions,status FROM actions WHERE project_id=? ORDER BY created_at DESC LIMIT 5",
            project.id,
          )
          .map((item) => ({
            ...item,
            instructions: item.instructions.slice(0, 1000),
          })),
      };
      const result = await provider.complete(
        prompts(project, history, run.kind, action, context),
        { json: run.kind === "plan", signal: control.signal },
      );
      const proposal = run.kind === "plan" ? parseProposal(result) : null;
      store.transaction(() => {
        // Cancellation wins, even if an upstream provider ignores abort.
        if (
          store.get("SELECT status FROM runs WHERE id=?", run.id)?.status !==
          "running"
        )
          return;
        const timestamp = now();
        if (run.kind === "chat")
          store.run(
            "INSERT INTO messages VALUES(?,?,?,?,?)",
            randomUUID(),
            project.id,
            "assistant",
            result,
            timestamp,
          );
        if (proposal)
          store.run(
            "INSERT INTO actions VALUES(?,?,?,?,?,?,?,?)",
            randomUUID(),
            project.id,
            proposal.title,
            proposal.kind,
            proposal.instructions,
            proposal.rationale,
            "proposed",
            timestamp,
          );
        if (run.kind === "generate") {
          store.run(
            "INSERT INTO artifacts(id,project_id,action_id,title,content,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            randomUUID(),
            project.id,
            action.id,
            action.title,
            result,
            timestamp,
            timestamp,
          );
          store.run(
            "UPDATE actions SET status='completed' WHERE id=?",
            action.id,
          );
        }
        store.run(
          "UPDATE runs SET status='succeeded',finished_at=? WHERE id=?",
          timestamp,
          run.id,
        );
        store.run(
          "UPDATE projects SET updated_at=? WHERE id=?",
          timestamp,
          project.id,
        );
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "run_failed",
          runId: run.id,
          type: error.name,
        }),
      );
      const safe = /^(The AI |The response )/.test(error.message)
        ? error.message
        : error.name === "TimeoutError"
          ? "The AI took too long. Try a smaller request."
          : "The task could not finish. Please try again.";
      store.transaction(() => {
        if (
          store.get("SELECT status FROM runs WHERE id=?", run.id)?.status !==
          "running"
        )
          return;
        store.run(
          "UPDATE runs SET status='failed',error=?,finished_at=? WHERE id=?",
          safe,
          now(),
          run.id,
        );
        if (action)
          store.run("UPDATE actions SET status='failed' WHERE id=?", action.id);
      });
    } finally {
      controls.delete(run.id);
    }
  }
  function startRun(project, user, kind, data, action = null) {
    const requestId = idField(data);
    const content = kind === "chat" ? textField(data, "content", 1, 12000) : "";
    const requestHash = digest(
      JSON.stringify({ kind, content, action: action?.id || null }),
    );
    const prior = store.get(
      "SELECT * FROM runs WHERE project_id=? AND request_id=?",
      project.id,
      requestId,
    );
    if (prior) {
      if (prior.request_hash !== requestHash)
        fail(
          409,
          "This request identifier was already used for a different task.",
        );
      return prior;
    }
    if (!provider.ready)
      fail(503, "AI is not configured. Contact the workspace owner.");
    if (action?.status === "completed")
      fail(
        409,
        "This deliverable has already been generated. Open it in Documents.",
      );
    if (action?.status === "dismissed")
      fail(409, "This proposal was dismissed.");
    if (
      store.get(
        "SELECT id FROM runs WHERE project_id=? AND status='running'",
        project.id,
      )
    )
      fail(409, "A task is already running in this project.");
    if (
      store.get("SELECT count(*) AS n FROM runs WHERE status='running'").n >=
        4 ||
      store.get(
        "SELECT count(*) AS n FROM runs r JOIN projects p ON p.id=r.project_id WHERE p.user_id=? AND r.status='running'",
        user.id,
      ).n >= 2
    )
      fail(429, "Two tasks can run at once. Wait for a task to finish.");
    if (
      store.get(
        "SELECT count(*) AS n FROM runs r JOIN projects p ON p.id=r.project_id WHERE p.user_id=? AND r.created_at>?",
        user.id,
        now() - 3600000,
      ).n >= 60
    )
      fail(429, "You have reached 60 tasks this hour. Please try again later.");
    const run = { id: randomUUID(), kind, project_id: project.id };
    store.transaction(() => {
      store.run(
        "INSERT INTO runs(id,project_id,request_id,request_hash,kind,action_id,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
        run.id,
        project.id,
        requestId,
        requestHash,
        kind,
        action?.id || null,
        "running",
        now(),
      );
      if (content)
        store.run(
          "INSERT INTO messages VALUES(?,?,?,?,?)",
          randomUUID(),
          project.id,
          "user",
          content,
          now(),
        );
      if (action)
        store.run("UPDATE actions SET status='running' WHERE id=?", action.id);
      store.run(
        "UPDATE projects SET updated_at=? WHERE id=?",
        now(),
        project.id,
      );
    });
    // Async jobs survive browser navigation. Their durable status is polled by the UI.
    void execute(run, project, action);
    return store.get("SELECT * FROM runs WHERE id=?", run.id);
  }

  async function readBody(req) {
    if (!req.headers["content-type"]?.startsWith("application/json"))
      fail(415, "Send JSON request data.");
    let bytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 768000) fail(413, "This request is too large.");
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw new Error();
      return value;
    } catch {
      fail(400, "Invalid JSON request.");
    }
  }

  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status, value) => {
      res.writeHead(status);
      res.end(JSON.stringify(value));
    };
    try {
      const requestUrl = new URL(req.url, origin);
      const path = requestUrl.pathname;
      const method = req.method;
      if (path === "/api/health" && method === "GET") {
        store.get("SELECT 1");
        return reply(200, { ok: true, aiReady: provider.ready });
      }
      if (!path.startsWith("/api/")) fail(404, "Not found.");
      if (
        process.env.SOLOOP_MAINTENANCE_FILE &&
        existsSync(process.env.SOLOOP_MAINTENANCE_FILE)
      )
        fail(503, "The workspace is being updated. Please try again shortly.");
      const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutation && req.headers.origin !== origin)
        fail(403, "This request did not come from this workspace.");
      if (path === "/api/auth/login" && method === "POST") {
        const ip = trustProxy
          ? req.headers["x-forwarded-for"] || req.socket.remoteAddress
          : req.socket.remoteAddress;
        attempt(`ip:${ip}`, 30);
        const data = await readBody(req);
        const username = textField(data, "username", 1, 64).toLowerCase();
        const password = passwordField(data, "password");
        attempt(`username:${username}`, 15);
        const user = store.get(
          "SELECT * FROM users WHERE username=?",
          username,
        );
        const valid = await authWork(() =>
          verifyPassword(password, user?.password_hash || dummyHash),
        );
        const csrf = store.transaction(() => {
          if (
            !valid ||
            !user ||
            store.get("SELECT password_hash FROM users WHERE id=?", user.id)
              ?.password_hash !== user.password_hash
          )
            fail(401, "Incorrect username or password.");
          return newSession(res, user.id);
        });
        return reply(200, {
          user: { id: user.id, username: user.username },
          csrf,
        });
      }
      const user = session(req);
      if (mutation && req.headers["x-csrf-token"] !== user.csrf)
        fail(
          403,
          "Your security token expired. Refresh the page and try again.",
        );
      const data = mutation ? await readBody(req) : {};
      if (mutation) session(req); // A slow request body must not outlive session revocation.
      if (path === "/api/auth/session" && method === "GET")
        return reply(200, {
          user: { id: user.id, username: user.username },
          csrf: user.csrf,
          aiReady: provider.ready,
          model: provider.model,
        });
      if (path === "/api/auth/logout" && method === "POST") {
        store.run("DELETE FROM sessions WHERE token_hash=?", user.token_hash);
        res.setHeader("Set-Cookie", sessionCookie("", 0));
        return reply(200, { ok: true });
      }
      if (path === "/api/auth/password" && method === "POST") {
        attempt(`password:${user.id}`, 10);
        const currentPassword = passwordField(data, "currentPassword");
        const nextPassword = passwordField(data, "newPassword", 12);
        if (currentPassword === nextPassword)
          fail(400, "Choose a different password.");
        const row = store.get(
          "SELECT password_hash FROM users WHERE id=?",
          user.id,
        );
        if (
          !(await authWork(() =>
            verifyPassword(currentPassword, row.password_hash),
          ))
        )
          fail(401, "Current password is incorrect.");
        const hash = await authWork(() => hashPassword(nextPassword));
        const csrf = store.transaction(() => {
          if (
            !store.run(
              "UPDATE users SET password_hash=? WHERE id=? AND password_hash=?",
              hash,
              user.id,
              row.password_hash,
            ).changes
          )
            fail(
              409,
              "Your password was changed in another session. Log in again.",
            );
          store.run("DELETE FROM sessions WHERE user_id=?", user.id);
          return newSession(res, user.id);
        });
        return reply(200, { csrf });
      }
      if (path === "/api/projects" && method === "GET")
        return reply(200, {
          projects: store.all(
            "SELECT id,name,brief,url,created_at,updated_at,version FROM projects WHERE user_id=? ORDER BY updated_at DESC",
            user.id,
          ),
        });
      if (path === "/api/projects" && method === "POST") {
        const project = projectFields(data);
        if (
          store.get(
            "SELECT count(*) AS n FROM projects WHERE user_id=?",
            user.id,
          ).n >= 200
        )
          fail(409, "This workspace has reached its 200-project limit.");
        const id = randomUUID();
        store.run(
          "INSERT INTO projects(id,user_id,name,brief,url,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
          id,
          user.id,
          project.name,
          project.brief,
          project.url,
          now(),
          now(),
        );
        return reply(201, detail(ownProject(id, user)));
      }
      const match = path.match(
        /^\/api\/projects\/([a-f0-9-]{36})(?:\/(chat|plan|actions|runs|artifacts)(?:\/([a-f0-9-]{36}))?(?:\/(approve|dismiss|cancel))?)?$/,
      );
      if (!match) fail(404, "Not found.");
      const [, projectId, section, itemId, operation] = match;
      const project = ownProject(projectId, user);
      if (
        !section &&
        method === "GET" &&
        requestUrl.searchParams.has("before")
      ) {
        const before = Number(requestUrl.searchParams.get("before"));
        if (!Number.isSafeInteger(before) || before < 1)
          fail(400, "Invalid message cursor.");
        return reply(200, {
          messages: store.all(
            "SELECT * FROM (SELECT rowid AS sequence,* FROM messages WHERE project_id=? AND rowid<? ORDER BY rowid DESC LIMIT 200) ORDER BY sequence",
            projectId,
            before,
          ),
        });
      }
      if (!section && method === "GET") return reply(200, detail(project));
      if (!section && method === "PATCH") {
        if (
          store.get(
            "SELECT id FROM runs WHERE project_id=? AND status='running'",
            projectId,
          )
        )
          fail(
            409,
            "Wait for the running task before changing the project brief.",
          );
        const fields = projectFields(data);
        if (data.version !== project.version)
          fail(
            409,
            "The project changed in another tab. Reopen the brief before saving.",
          );
        store.run(
          "UPDATE projects SET name=?,brief=?,url=?,updated_at=?,version=version+1 WHERE id=?",
          fields.name,
          fields.brief,
          fields.url,
          now(),
          projectId,
        );
        return reply(200, detail(ownProject(projectId, user)));
      }
      if (["chat", "plan"].includes(section) && !itemId && method === "POST")
        return reply(202, { run: startRun(project, user, section, data) });
      if (section === "actions" && itemId && method === "POST") {
        const action = store.get(
          "SELECT * FROM actions WHERE id=? AND project_id=?",
          itemId,
          projectId,
        );
        if (!action) fail(404, "Proposal not found.");
        if (operation === "approve")
          return reply(202, {
            run: startRun(project, user, "generate", data, action),
          });
        if (operation === "dismiss") {
          if (!["proposed", "failed", "cancelled"].includes(action.status))
            fail(409, "This proposal cannot be dismissed now.");
          store.run("UPDATE actions SET status='dismissed' WHERE id=?", itemId);
          return reply(200, { ok: true });
        }
      }
      if (section === "runs" && operation === "cancel" && method === "POST") {
        const run = store.get(
          "SELECT * FROM runs WHERE id=? AND project_id=?",
          itemId,
          projectId,
        );
        if (!run) fail(404, "Task not found.");
        store.transaction(() => {
          if (run.status !== "running") return;
          store.run(
            "UPDATE runs SET status='cancelled',finished_at=? WHERE id=?",
            now(),
            itemId,
          );
          if (run.action_id)
            store.run(
              "UPDATE actions SET status='cancelled' WHERE id=?",
              run.action_id,
            );
        });
        controls.get(itemId)?.abort();
        return reply(200, { ok: true });
      }
      if (section === "artifacts" && itemId && !operation && method === "GET") {
        const artifact = store.get(
          "SELECT * FROM artifacts WHERE id=? AND project_id=?",
          itemId,
          projectId,
        );
        if (!artifact) fail(404, "Document not found.");
        return reply(200, { artifact });
      }
      if (
        section === "artifacts" &&
        itemId &&
        !operation &&
        method === "PATCH"
      ) {
        const artifact = store.get(
          "SELECT * FROM artifacts WHERE id=? AND project_id=?",
          itemId,
          projectId,
        );
        if (!artifact) fail(404, "Document not found.");
        if (data.version !== artifact.version)
          fail(
            409,
            "This document changed in another tab. Close the editor and reopen it before saving.",
          );
        const content = textField(data, "content", 1, 100000);
        store.run(
          "UPDATE artifacts SET content=?,version=version+1,updated_at=? WHERE id=?",
          content,
          now(),
          itemId,
        );
        return reply(200, {
          artifact: store.get("SELECT * FROM artifacts WHERE id=?", itemId),
        });
      }
      fail(404, "Not found.");
    } catch (error) {
      if (!(error instanceof HttpError))
        console.error(
          JSON.stringify({ event: "request_failed", type: error.name }),
        );
      if (!res.headersSent)
        reply(error.status || 500, {
          error:
            error instanceof HttpError
              ? error.message
              : "Something went wrong. Please try again.",
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    async close() {
      for (const control of controls.values()) control.abort();
      await new Promise((resolve) => server.close(resolve));
      // Provider tasks finish before the caller closes SQLite.
      while (controls.size)
        await new Promise((resolve) => setTimeout(resolve, 10));
    },
  };
}
