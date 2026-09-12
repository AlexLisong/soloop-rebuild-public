import { PublicShell } from "@/components/soloop/PublicShell";
export default function Privacy() {
  return <PublicShell><article className="site-document">
    <p className="site-eyebrow">Data & privacy</p><h1>Know where your context goes.</h1>
    <p>This page describes the application code. The operator of your installation is responsible for its privacy policy, retention choices, and contact details.</p>
    <h2>Saved in your workspace</h2><p>The application stores your account, project briefs, conversations, proposals, generated documents, and task status. Passwords and session tokens are stored as hashes. Saved work persists when you leave the page.</p>
    <h2>Shared for AI tasks</h2><p>When you start an AI task, your prompt, project brief, recent conversation, and selected saved-work excerpts are sent to the operator’s configured AI provider. A supplied website URL is context only; the application does not fetch it.</p>
    <h2>Your choices</h2><p>Use only information you are comfortable sharing with the operator and their AI provider. Download documents you want to keep. Ask your workspace administrator about deletion, account access, backups, provider terms, and retention.</p>
    <h2>Public pages</h2><p>The repository does not include advertising or analytics trackers. An operator’s infrastructure may produce access logs or add other services; ask the operator about their installation.</p>
  </article></PublicShell>;
}
