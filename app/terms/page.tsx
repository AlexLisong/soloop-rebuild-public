import { PublicShell } from "@/components/soloop/PublicShell";
export default function Terms() {
  return <PublicShell><article className="site-document">
    <p className="site-eyebrow">Use & limitations</p><h1>Your review is part of the work.</h1>
    <p>These product notes explain the application’s limits. They are not a service agreement on behalf of any operator. Your workspace administrator supplies any terms applicable to their installation.</p>
    <h2>Review generated material</h2><p>AI output can contain errors, omissions, or unsupported claims. Check facts, rights, and suitability before using a document. Approving a proposal creates a draft inside this workspace; it does not authorize external actions.</p>
    <h2>Use information responsibly</h2><p>Only provide content you have permission to use and share with the configured AI provider. Protect your account credentials and do not attempt to access another person’s workspace.</p>
    <h2>Keep your own copies</h2><p>This early project has no promised availability or response schedule. Download important documents and ask your administrator about backups, retention, and support.</p>
    <h2>Software license</h2><p>The project’s original code is available under the MIT license in its repository. Third-party dependencies retain their own license terms. The software license does not establish ownership or accuracy of generated output.</p>
  </article></PublicShell>;
}
