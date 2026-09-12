"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Download, LogOut, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  api,
  type Artifact,
  type Detail,
  type Project,
  type Session,
} from "@/lib/workspace-api";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="ws-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          img: ({ alt }) => <span>[Image: {alt || "not loaded"}]</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

function useWork() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const work = async (fn: () => Promise<void>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, error, work };
}

export function ProjectDialog({
  project: initialProject,
  csrf,
  onClose,
  onSaved,
}: {
  project?: Project;
  csrf: string;
  onClose: () => void;
  onSaved: (project: Project) => Promise<void>;
}) {
  // Polling may refresh the project while this form is open. Keep the opening
  // version with the user's draft so a concurrent edit returns a conflict.
  const [project] = useState(initialProject);
  const { busy, error, work } = useWork();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="ws-dialog">
        <DialogTitle>
          {project ? "Your project brief" : "Give your idea a home."}
        </DialogTitle>
        <DialogDescription>
          A little context helps Soloop give you more useful answers.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            void work(async () => {
              const result = await api<Detail>(
                project ? `/projects/${project.id}` : "/projects",
                project ? "PATCH" : "POST",
                {
                  name: fields.get("name"),
                  brief: fields.get("brief"),
                  url: fields.get("url"),
                  version: project?.version,
                },
                csrf,
              );
              await onSaved(result.project);
            });
          }}
        >
          <label htmlFor="project-name">Project name</label>
          <input
            id="project-name"
            disabled={busy}
            name="name"
            placeholder="e.g. Weekend Studio"
            required
            maxLength={100}
            defaultValue={project?.name || ""}
          />
          <label htmlFor="project-brief">What are you building?</label>
          <textarea
            id="project-brief"
            disabled={busy}
            name="brief"
            placeholder="Describe the idea, who it’s for, and what you want to achieve. Include any constraints or decisions you’ve already made."
            required
            minLength={10}
            maxLength={12000}
            rows={6}
            defaultValue={project?.brief || ""}
          />
          <label htmlFor="project-url">
            Website <span>(optional · context only)</span>
          </label>
          <input
            id="project-url"
            disabled={busy}
            name="url"
            type="url"
            placeholder="https://"
            maxLength={2000}
            defaultValue={project?.url || ""}
          />
          {error && (
            <p className="ws-form-error" role="alert">
              {error}
            </p>
          )}
          <button className="ws-primary" disabled={busy} type="submit">
            {busy ? "Saving…" : project ? "Save brief" : "Create project"}
            <ArrowUpRight size={16} />
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentDialog({
  artifact,
  projectId,
  csrf,
  onClose,
  onSaved,
}: {
  artifact: Artifact;
  projectId: string;
  csrf: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [saved, setSaved] = useState(artifact);
  const [draft, setDraft] = useState(artifact.content);
  const [editing, setEditing] = useState(false);
  const { busy, error, work } = useWork();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          if (
            draft !== saved.content &&
            !window.confirm("Close without saving your document edits?")
          )
            return;
          onClose();
        }
      }}
    >
      <DialogContent className="ws-document-dialog">
        <DialogTitle>{saved.title}</DialogTitle>
        <DialogDescription>
          Saved document · Version {saved.version}
        </DialogDescription>
        <div className="ws-document-tools">
          <button className="ws-secondary" onClick={() => setEditing(!editing)}>
            <Pencil size={15} />
            {editing ? "Preview" : "Edit Markdown"}
          </button>
          <button
            className="ws-secondary"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([draft], { type: "text/markdown;charset=utf-8" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = `${saved.title.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 100) || "document"}.md`;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            <Download size={15} /> Download
          </button>
          <button
            className="ws-primary"
            disabled={busy || !draft.trim() || draft === saved.content}
            onClick={() =>
              work(async () => {
                const result = await api<{ artifact: Artifact }>(
                  `/projects/${projectId}/artifacts/${saved.id}`,
                  "PATCH",
                  { content: draft, version: saved.version },
                  csrf,
                );
                setSaved(result.artifact);
                setDraft(result.artifact.content);
                setEditing(false);
                await onSaved();
              })
            }
          >
            {busy
              ? "Saving…"
              : draft === saved.content
                ? "Saved"
                : "Save changes"}
          </button>
        </div>
        {error && (
          <p className="ws-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ws-document-body">
          {editing ? (
            <textarea
              aria-label="Document Markdown"
              disabled={busy}
              value={draft}
              maxLength={100000}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <Markdown>{draft}</Markdown>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AccountDialog({
  session,
  onClose,
  onSession,
}: {
  session: Session;
  onClose: () => void;
  onSession: (session: Session) => void;
}) {
  const { busy, error, work } = useWork();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!busy && !open) onClose();
      }}
    >
      <DialogContent className="ws-dialog">
        <DialogTitle>Account settings</DialogTitle>
        <DialogDescription>
          Signed in as {session.user.username}. Changing your password signs out
          your other sessions.
        </DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            void work(async () => {
              if (values.get("newPassword") !== values.get("confirmPassword"))
                throw new Error("The new passwords do not match.");
              const result = await api<{ csrf: string }>(
                "/auth/password",
                "POST",
                {
                  currentPassword: values.get("currentPassword"),
                  newPassword: values.get("newPassword"),
                },
                session.csrf,
              );
              onSession({ ...session, csrf: result.csrf });
              form.reset();
              onClose();
            });
          }}
        >
          <label htmlFor="current-password">Current password</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            placeholder="At least 12 characters"
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
          />
          {error && (
            <p className="ws-form-error" role="alert">
              {error}
            </p>
          )}
          <button className="ws-primary" disabled={busy} type="submit">
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
        <button
          className="ws-secondary"
          disabled={busy}
          onClick={() =>
            work(async () => {
              await api("/auth/logout", "POST", {}, session.csrf);
              window.location.assign("/login");
            })
          }
        >
          <LogOut size={16} /> Log out
        </button>
      </DialogContent>
    </Dialog>
  );
}
