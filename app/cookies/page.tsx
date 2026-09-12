import { PublicShell } from "@/components/soloop/PublicShell";
export default function Cookies() {
  return <PublicShell><article className="site-document">
    <p className="site-eyebrow">Cookies</p><h1>A session for your workspace.</h1>
    <p>The application uses an essential session cookie to keep you signed in. Its opaque value identifies a session; it does not contain your project documents or provider credentials.</p>
    <h2>Session protection</h2><p>The cookie is inaccessible to page JavaScript and uses a strict same-site policy. In production it requires HTTPS. Signing out invalidates the current session; password changes revoke existing sessions.</p>
    <h2>Browser controls</h2><p>Blocking or clearing the session cookie signs you out or prevents login. It does not delete saved projects or documents. The repository includes no advertising cookies or third-party analytics scripts.</p>
    <p>Contact your workspace administrator for questions about additional services or cookies in their installation.</p>
  </article></PublicShell>;
}
