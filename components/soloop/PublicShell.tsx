import type { ReactNode } from "react";

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a className="site-brand" href="/" aria-label="Founder Workspace home">
          <img src="/favicon.svg" alt="" width="32" height="32" />
          <span>Founder Workspace</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/about">About</a>
          <a className="site-button site-button-small" href="/app">Open workspace</a>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <p>An independent project. Not affiliated with Soloop.</p>
        <nav aria-label="Project information">
          <a href="/privacy">Data & privacy</a>
          <a href="/cookies">Cookies</a>
          <a href="/terms">Use & limitations</a>
        </nav>
      </footer>
    </div>
  );
}
