import type { Metadata } from "next";
import "./globals.css";
import "../styles/workspace.css";
import "../styles/site.css";

export const metadata: Metadata = {
  title: "Founder Workspace — Soloop rebuild",
  description: "A private project workspace for AI conversations, reviewed plans, and editable documents.",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-general">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <div className="app-content-root">{children}</div>
      </body>
    </html>
  );
}
