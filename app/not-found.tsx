import { PublicShell } from "@/components/soloop/PublicShell";
export default function NotFound() {
  return <PublicShell><section className="site-document"><p className="site-eyebrow">404</p><h1>This page could not be found.</h1><p>The link may have changed or the address may be incomplete.</p><a className="site-button" href="/">Back to the homepage</a></section></PublicShell>;
}
