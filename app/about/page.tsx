import { PublicShell } from "@/components/soloop/PublicShell";
export default function About() {
  return <PublicShell><article className="site-document">
    <p className="site-eyebrow">About the project</p><h1>A place to develop an idea.</h1>
    <p>Founder Workspace brings a project brief, AI conversation, and editable documents together. It is intended for independent builders who want to keep useful context close to the work.</p>
    <h2>What you can do</h2><p>Create a private project, discuss a question, request a next-step proposal, and approve a written deliverable. Saved work can inform follow-up conversations. Documents can be edited and downloaded as Markdown.</p>
    <h2>What to expect</h2><p>This is an early project. The assistant uses the information you supply and can make mistakes. It cannot verify current facts by browsing, run software, send email, or publish to external services. There is no public signup or billing.</p>
    <h2>Independent implementation</h2><p>The repository began as a visual study of Soloop. Its public pages now use original copy and graphics; its founder workspace was independently implemented. This project is not affiliated with or endorsed by Soloop.</p>
    <a className="site-button" href="/app">Open workspace</a>
  </article></PublicShell>;
}
