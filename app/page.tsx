import { PublicShell } from "@/components/soloop/PublicShell";

export default function Home() {
  return (
    <PublicShell>
      <section className="site-intro">
        <p className="site-eyebrow">A workspace for independent builders</p>
        <h1>From a rough idea to work you can use.</h1>
        <p className="site-lead">Keep your project context, think through the next move, and turn a reviewed plan into an editable document.</p>
        <div className="site-actions">
          <a className="site-button" href="/app">Open your workspace</a>
          <a href="#workflow">Explore the workflow</a>
        </div>
        <p className="site-caption">Private accounts provisioned by your workspace administrator.</p>
      </section>
      <section className="site-workflow" id="workflow" aria-labelledby="workflow-title">
        <div className="site-section-heading">
          <p className="site-eyebrow">Context → conversation → document</p>
          <h2 id="workflow-title">You decide what happens next.</h2>
        </div>
        <ol className="site-steps">
          <li><span className="site-step-number">01</span><h3>Give your idea a home</h3><p>Save a project brief and the context that matters. Return to your conversations and documents as the idea develops.</p></li>
          <li><span className="site-step-number">02</span><h3>Review a useful next move</h3><p>Talk through a question, then request a proposal. Check its purpose and instructions before approving the work.</p></li>
          <li><span className="site-step-number">03</span><h3>Make the result yours</h3><p>Generate a product specification, analysis, marketing draft, or launch plan. Edit it and download the Markdown.</p></li>
        </ol>
      </section>
      <section className="site-note">
        <h2>Drafts with you in control</h2>
        <p>The assistant works from the context you provide. It does not browse the web, send messages, execute code, or publish your work. Review generated claims and assumptions before using them.</p>
        <a href="/about">Read about the project</a>
      </section>
    </PublicShell>
  );
}
