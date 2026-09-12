"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginDialog() {
  const router = useRouter();
  const heading = useRef<HTMLHeadingElement>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { signal: controller.signal })
      .then((response) => {
        if (response.ok) window.location.replace("/app");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Unable to sign in.");
      window.location.assign("/app");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect. Please try again.",
      );
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.push("/");
      }}
    >
      <DialogContent
        className="auth-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          heading.current?.focus();
        }}
        aria-labelledby="main-content"
        aria-describedby="auth-description"
      >
        <span className="auth-brand">
          <img src="/wordmark.svg" alt="Founder Workspace" />
        </span>
        <div>
          <p className="auth-eyebrow">Your founder workspace</p>
          <DialogTitle asChild>
            <h1
              className="auth-title"
              id="main-content"
              tabIndex={-1}
              ref={heading}
            >
              Welcome back.
            </h1>
          </DialogTitle>
        </div>
        <DialogDescription id="auth-description">
          Log in to your private projects, conversations, and documents.
        </DialogDescription>
        <form onSubmit={login} className="login-form">
          <label htmlFor="username">Username</label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            placeholder="admin"
            required
            maxLength={64}
            className="auth-input"
          />
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
            className="auth-input"
          />
          {message && (
            <p className="auth-notice" role="alert">
              {message}
            </p>
          )}
          <Button type="submit" disabled={busy} className="auth-continue">
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>
        <p className="auth-legal">
          Private workspace. Use the account details provided by the owner. If
          you need a password reset, contact your workspace administrator.
        </p>
      </DialogContent>
    </Dialog>
  );
}
