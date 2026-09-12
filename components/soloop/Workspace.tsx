"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  FileText,
  Folder,
  LoaderCircle,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  api,
  type Artifact,
  type Detail,
  type Project,
  type Session,
  type Message,
} from "@/lib/workspace-api";
import {
  AccountDialog,
  DocumentDialog,
  ProjectDialog,
  Markdown,
} from "./WorkspaceDialogs";

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Unable to connect. Please try again.";
const kindLabel = (kind: string) =>
  kind
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

export function Workspace() {
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [formMode, setFormMode] = useState<"new" | "edit" | null>(null);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<"conversation" | "documents">("conversation");
  const [draft, setDraft] = useState("");
  const [editor, setEditor] = useState<Artifact | null>(null);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [historyEnd, setHistoryEnd] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const selection = useRef<string | null>(null);
  const busyRef = useRef(false);
  const requestRef = useRef<{ signature: string; id: string } | null>(null);
  const drafts = useRef<Record<string, string>>({});

  const reloadList = useCallback(async () => {
    const result = await api<{ projects: Project[] }>("/projects");
    setProjects(result.projects);
    return result.projects;
  }, []);
  const loadProject = useCallback(async (id: string, first = false) => {
    const next = await api<Detail>(`/projects/${id}`);
    if (selection.current !== id) return;
    setDetail(next);
    if (first) setLoading(false);
  }, []);
  const choose = useCallback(
    (id: string) => {
      selection.current = id;
      setSelected(id);
      setDetail(null);
      setLoading(true);
      setError("");
      setDraft(drafts.current[id] || "");
      setOlderMessages([]);
      setHistoryEnd(false);
      setMobileNav(false);
      setTab("conversation");
      window.history.replaceState(null, "", `/app?project=${id}`);
      loadProject(id, true).catch((error) => {
        if (selection.current === id) {
          setError(errorText(error));
          setLoading(false);
        }
      });
    },
    [loadProject],
  );

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const [auth, list] = await Promise.all([
          api<Session>("/auth/session"),
          api<{ projects: Project[] }>("/projects"),
        ]);
        if (!active) return;
        setSession(auth);
        setProjects(list.projects);
        const queryId = new URLSearchParams(window.location.search).get(
          "project",
        );
        const target =
          list.projects.find((project) => project.id === queryId) ||
          list.projects[0];
        if (target) choose(target.id);
        else setLoading(false);
      } catch (error) {
        if (active) {
          setError(errorText(error));
          setLoading(false);
        }
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [choose]);

  const run = detail?.runs.find((item) => item.status === "running");
  const runId = run?.id;
  useEffect(() => {
    if (!selected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        await loadProject(selected);
      } catch (error) {
        if (!stopped) setError(errorText(error));
      }
      if (!stopped) timer = setTimeout(poll, runId ? 1500 : 12000);
    };
    timer = setTimeout(poll, runId ? 1000 : 12000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [selected, runId, loadProject]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [detail?.messages.length, selected]);

  async function mutate(path: string, data: unknown = {}) {
    return api(path, "POST", data, session?.csrf);
  }
  async function doWork(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setWorking(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(errorText(error));
    } finally {
      busyRef.current = false;
      setWorking(false);
    }
  }
  async function startTask(
    kind: "chat" | "plan" | "approve",
    actionId?: string,
  ) {
    if (!selected) return;
    const id = selected;
    const content = draft.trim();
    await doWork(async () => {
      const signature = JSON.stringify({
        id,
        kind,
        content: kind === "chat" ? content : "",
        actionId,
      });
      if (requestRef.current?.signature !== signature)
        requestRef.current = { signature, id: crypto.randomUUID() };
      const route = kind === "approve" ? `actions/${actionId}/approve` : kind;
      await mutate(`/projects/${id}/${route}`, {
        requestId: requestRef.current.id,
        ...(kind === "chat" ? { content } : {}),
      });
      requestRef.current = null;
      if (kind === "chat") {
        drafts.current[id] = "";
        if (selection.current === id) setDraft("");
      }
      await loadProject(id);
      await reloadList();
    });
  }
  const disabled = working || Boolean(run);
  async function openDocument(id: string) {
    const projectId = selected;
    await doWork(async () => {
      const result = await api<{ artifact: Artifact }>(
        `/projects/${projectId}/artifacts/${id}`,
      );
      if (selection.current === projectId) setEditor(result.artifact);
    });
  }
  async function loadOlder() {
    const first = olderMessages[0] || detail?.messages[0];
    const projectId = selected;
    if (!first) return;
    await doWork(async () => {
      const result = await api<{ messages: Message[] }>(
        `/projects/${projectId}?before=${first.sequence}`,
      );
      if (selection.current !== projectId) return;
      setOlderMessages((prior) => [...result.messages, ...prior]);
      if (result.messages.length < 200) setHistoryEnd(true);
    });
  }
  const pendingActions =
    detail?.actions.filter((action) =>
      ["proposed", "failed", "cancelled", "running"].includes(action.status),
    ) || [];

  if (!session)
    return (
      <main className="ws-gate" id="main-content">
        <img src="/wordmark.svg" alt="Founder Workspace" />
        <p role="status">
          {loading
            ? "Opening your workspace…"
            : error || "Please log in to continue."}
        </p>
        {!loading && (
          <a className="ws-primary" href="/login">
            Go to login <ArrowUpRight size={16} />
          </a>
        )}
      </main>
    );

  return (
    <div className="ws-shell">
      {mobileNav && (
        <button
          className="ws-nav-scrim"
          aria-label="Close project navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        id="project-sidebar"
        className={`ws-sidebar ${mobileNav ? "is-open" : ""}`}
        aria-label="Project navigation"
      >
        <a className="ws-brand" href="/">
          <img src="/wordmark.svg" alt="Founder Workspace home" />
          <span>Workspace</span>
        </a>
        <button
          className="ws-primary ws-new"
          onClick={() => {
            setFormMode("new");
            setMobileNav(false);
          }}
        >
          <Plus size={18} /> New project
        </button>
        <div className="ws-nav-heading">
          YOUR PROJECTS <span>{projects.length}</span>
        </div>
        <nav className="ws-projects">
          {projects.map((project) => (
            <button
              key={project.id}
              className={selected === project.id ? "active" : ""}
              onClick={() => choose(project.id)}
              aria-current={selected === project.id ? "page" : undefined}
            >
              <Folder size={17} />
              <span>{project.name}</span>
              <ChevronRight size={14} />
            </button>
          ))}
          {!projects.length && (
            <p className="ws-nav-empty">Your next idea starts here.</p>
          )}
        </nav>
        <div className="ws-sidebar-bottom">
          <span className="ws-private">
            <span /> Private workspace
          </span>
          <button onClick={() => setSettings(true)}>
            <span className="ws-avatar">
              {session.user.username.slice(0, 1).toUpperCase()}
            </span>
            <span>{session.user.username}</span>
            <Settings size={17} />
          </button>
        </div>
      </aside>
      <main id="main-content" className="ws-main">
        <header className="ws-header">
          <div>
            <button
              className="ws-icon ws-mobile-menu"
              aria-label="Open projects"
              aria-expanded={mobileNav}
              aria-controls="project-sidebar"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span className="ws-header-label">Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {detail?.project.name || (loading ? "Loading…" : "Your projects")}
            </strong>
          </div>
          <span className="ws-model">
            <span className={session.aiReady ? "connected" : ""} />
            {session.aiReady ? "AI connected" : "AI unavailable"}
          </span>
        </header>
        {error && (
          <div className="ws-error" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="ws-loading" role="status">
            <LoaderCircle className="ws-spin" /> Loading project…
          </div>
        ) : !detail ? (
          <div className="ws-welcome">
            <div className="ws-welcome-mark">
              <Sparkles size={30} />
            </div>
            <p className="ws-eyebrow">LET’S BUILD SOMETHING</p>
            <h1>
              One idea.
              <br />
              Your next move.
            </h1>
            <p>
              Give your project a home. Think it through with Soloop, then turn
              the next step into something you can use.
            </p>
            <button className="ws-primary" onClick={() => setFormMode("new")}>
              <Plus size={18} /> Create your first project
            </button>
            <div className="ws-starters">
              <span>
                <MessageSquare /> Talk it through
              </span>
              <span>
                <Sparkles /> Plan a next step
              </span>
              <span>
                <FileText /> Make it tangible
              </span>
            </div>
          </div>
        ) : (
          <>
            <section className="ws-project-heading">
              <div>
                <p className="ws-eyebrow">YOUR FOUNDER DESK</p>
                <h1>{detail.project.name}</h1>
                <p>{detail.project.brief}</p>
              </div>
              <button
                className="ws-secondary"
                disabled={disabled}
                onClick={() => setFormMode("edit")}
              >
                <Pencil size={15} /> Edit brief
              </button>
            </section>
            <div className="ws-tabs" role="tablist" aria-label="Project views">
              <button
                role="tab"
                aria-selected={tab === "conversation"}
                onClick={() => setTab("conversation")}
              >
                <MessageSquare size={17} /> Conversation
              </button>
              <button
                role="tab"
                aria-selected={tab === "documents"}
                onClick={() => setTab("documents")}
              >
                <FileText size={17} /> Documents{" "}
                <span>{detail.artifacts.length}</span>
              </button>
            </div>
            <div className="ws-work-area">
              <section
                className={`ws-conversation ${tab !== "conversation" ? "ws-hidden" : ""}`}
                aria-label="Project conversation"
              >
                <div className="ws-thread">
                  {!historyEnd && detail.messages.length >= 200 && (
                    <button
                      className="ws-secondary"
                      disabled={working}
                      onClick={loadOlder}
                    >
                      Load earlier messages
                    </button>
                  )}
                  {!detail.messages.length && (
                    <div className="ws-thread-empty">
                      <span className="ws-ai-avatar">
                        <Sparkles size={20} />
                      </span>
                      <h2>What should we work on first?</h2>
                      <p>
                        I can help sharpen your idea, work through a decision,
                        or make a plan you can act on.
                      </p>
                      <div className="ws-suggestions">
                        {[
                          "Help me find the strongest angle for this idea",
                          "What should I validate before building?",
                          "Draft a simple launch strategy",
                        ].map((prompt) => (
                          <button
                            key={prompt}
                            onClick={() => {
                              setDraft(prompt);
                              if (selected) drafts.current[selected] = prompt;
                            }}
                          >
                            {prompt}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {[
                    ...olderMessages,
                    ...detail.messages.filter(
                      (message) =>
                        !olderMessages.some((older) => older.id === message.id),
                    ),
                  ].map((message) => (
                    <article
                      key={message.id}
                      className={`ws-message ${message.role}`}
                    >
                      <div
                        className={
                          message.role === "assistant"
                            ? "ws-ai-avatar"
                            : "ws-user-avatar"
                        }
                      >
                        {message.role === "assistant" ? (
                          <Sparkles size={16} />
                        ) : (
                          session.user.username[0].toUpperCase()
                        )}
                      </div>
                      <div>
                        <p className="ws-message-author">
                          {message.role === "assistant" ? "Soloop" : "You"}
                        </p>
                        <Markdown>{message.content}</Markdown>
                      </div>
                    </article>
                  ))}
                  {run && (
                    <div className="ws-run" role="status">
                      <LoaderCircle className="ws-spin" size={17} />
                      <div>
                        <strong>
                          {run.kind === "chat"
                            ? "Thinking it through…"
                            : run.kind === "plan"
                              ? "Finding your next move…"
                              : "Creating your document…"}
                        </strong>
                        <span>
                          You can leave this page. Your result will be saved.
                        </span>
                      </div>
                      <button
                        className="ws-icon"
                        aria-label="Stop task"
                        disabled={working}
                        onClick={() =>
                          doWork(async () => {
                            await mutate(
                              `/projects/${selected}/runs/${run.id}/cancel`,
                            );
                            if (selected) await loadProject(selected);
                          })
                        }
                      >
                        <Square size={14} />
                      </button>
                    </div>
                  )}
                  {!run && detail.runs[0]?.status === "failed" && (
                    <div className="ws-run-error" role="status">
                      {detail.runs[0].error} Your saved work is still here.
                    </div>
                  )}
                  {!run && detail.runs[0]?.status === "cancelled" && (
                    <div className="ws-run-error" role="status">
                      Task stopped. Your saved work is still here.
                    </div>
                  )}
                  <div ref={bottom} />
                </div>
                <form
                  className="ws-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim() && !disabled) void startTask("chat");
                  }}
                >
                  <label className="sr-only" htmlFor="project-message">
                    Message Soloop
                  </label>
                  <textarea
                    id="project-message"
                    disabled={working}
                    placeholder="Ask a question or share what you’re thinking…"
                    value={draft}
                    maxLength={12000}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (selected)
                        drafts.current[selected] = event.target.value;
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        if (draft.trim() && !disabled) void startTask("chat");
                      }
                    }}
                  />
                  <div>
                    <span>Shift + Enter for a new line</span>
                    <button
                      className="ws-send"
                      type="submit"
                      aria-label="Send message"
                      disabled={disabled || !draft.trim() || !session.aiReady}
                    >
                      <ArrowUp size={20} />
                    </button>
                  </div>
                </form>
                <p className="ws-ai-note">
                  AI can make mistakes. Review important details. Links are used
                  as context; live web research is not connected.
                </p>
              </section>
              <section
                className={`ws-documents ${tab !== "documents" ? "ws-hidden" : ""}`}
                aria-label="Saved documents"
              >
                <div className="ws-doc-intro">
                  <h2>Made for this project</h2>
                  <p>Generated documents and your edits are saved here.</p>
                </div>
                {detail.artifacts.length ? (
                  detail.artifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      className="ws-document-card"
                      onClick={() => openDocument(artifact.id)}
                    >
                      <span>
                        <FileText size={23} />
                      </span>
                      <div>
                        <h3>{artifact.title}</h3>
                        <p>
                          Updated{" "}
                          {new Date(artifact.updated_at).toLocaleDateString()} ·
                          Version {artifact.version}
                        </p>
                      </div>
                      <ArrowUpRight size={18} />
                    </button>
                  ))
                ) : (
                  <div className="ws-doc-empty">
                    <FileText size={32} />
                    <h3>Your first document is one next step away.</h3>
                    <p>
                      Ask Soloop to plan a next move, review the proposal, then
                      approve it to generate a document.
                    </p>
                    <button
                      className="ws-primary"
                      disabled={disabled || !session.aiReady}
                      onClick={() => startTask("plan")}
                    >
                      <Sparkles size={16} /> Plan next move
                    </button>
                  </div>
                )}
              </section>
              <aside className="ws-next">
                <div className="ws-next-heading">
                  <span>
                    <Sparkles size={17} /> NEXT MOVE
                  </span>
                  <span className="ws-tag">You decide</span>
                </div>
                <h2>From thinking to doing.</h2>
                <p>
                  Get a focused proposal. Review it, then let Soloop create the
                  document.
                </p>
                <button
                  className="ws-primary"
                  disabled={disabled || !session.aiReady}
                  onClick={() => startTask("plan")}
                >
                  <Sparkles size={16} />{" "}
                  {run?.kind === "plan" ? "Planning…" : "Plan next move"}
                </button>
                {pendingActions.map((action) => (
                  <article className="ws-action" key={action.id}>
                    <span className="ws-kind">{kindLabel(action.kind)}</span>
                    <h3>{action.title}</h3>
                    <p>{action.rationale}</p>
                    <details>
                      <summary>What Soloop will create</summary>
                      <p>{action.instructions}</p>
                    </details>
                    <button
                      className="ws-primary"
                      disabled={disabled || !session.aiReady}
                      onClick={() => startTask("approve", action.id)}
                    >
                      {action.status === "running" ? (
                        <LoaderCircle size={16} className="ws-spin" />
                      ) : (
                        <Check size={16} />
                      )}
                      {action.status === "running"
                        ? "Generating…"
                        : action.status === "failed" ||
                            action.status === "cancelled"
                          ? "Retry generation"
                          : "Approve & generate"}
                    </button>
                    <button
                      className="ws-text-button"
                      disabled={disabled}
                      onClick={() =>
                        doWork(async () => {
                          await mutate(
                            `/projects/${selected}/actions/${action.id}/dismiss`,
                          );
                          if (selected) await loadProject(selected);
                        })
                      }
                    >
                      Dismiss proposal
                    </button>
                  </article>
                ))}
                {detail.artifacts.length > 0 && (
                  <div className="ws-recent">
                    <span className="ws-nav-heading">RECENT DOCUMENT</span>
                    <button
                      onClick={() => openDocument(detail.artifacts[0].id)}
                    >
                      <FileText size={17} />
                      <span>{detail.artifacts[0].title}</span>
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                )}
                <div className="ws-capabilities">
                  <span>GOOD THINGS TO MAKE</span>
                  <p>
                    Product specs · Market analysis
                    <br />
                    Marketing copy · Launch plans
                  </p>
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
      {formMode && (
        <ProjectDialog
          project={formMode === "edit" ? detail?.project : undefined}
          csrf={session.csrf}
          onClose={() => setFormMode(null)}
          onSaved={async (project) => {
            await reloadList();
            setFormMode(null);
            choose(project.id);
          }}
        />
      )}
      {editor && selected && (
        <DocumentDialog
          artifact={editor}
          projectId={selected}
          csrf={session.csrf}
          onClose={() => setEditor(null)}
          onSaved={() => loadProject(selected)}
        />
      )}
      {settings && (
        <AccountDialog
          session={session}
          onClose={() => setSettings(false)}
          onSession={setSession}
        />
      )}
    </div>
  );
}
