# Soloop rebuild · Founder Workspace

A private project workspace for turning an idea into useful written work. Keep
project briefs, AI conversations, reviewed proposals, and editable Markdown
documents together.

The project began as a visual reconstruction of Soloop. It now uses original
public pages and graphics with an independently implemented workspace. It is not
affiliated with Soloop. See [provenance and licenses](docs/PROVENANCE.md).

## What it does

- Private username/password login, sessions, password changes, and logout.
- Saved projects and conversations with bounded recent-work context.
- AI proposals that require approval before document generation.
- Editable Markdown documents, download, cancellation, and persisted task status.
- Product specs, market-analysis drafts, marketing copy, and launch plans.

This is an early, self-hosted project. There is no public signup, billing, OAuth,
live browsing, external publishing, email sending, or code execution. Generated
analysis uses your supplied context and may be wrong; review claims and assumptions.

## Run locally

Use **Node.js 22.13+**; `.nvmrc` pins the tested version. Python 3.12+ is needed only
for optional release/backup tools. The normal local workflow needs no cloud account.

```sh
git clone https://github.com/AlexLisong/soloop-rebuild-public.git
cd soloop-rebuild-public
nvm use
npm run install:ci
node server/admin.mjs provision .data/owner-login.json
npm run dev:api
```

In a second terminal:

```sh
npm run dev
```

Open **http://localhost:5173/app**. Read your generated credentials from the
ignored `.data/owner-login.json` file locally; it is created with owner-only
permissions. Provisioning refuses to overwrite an existing account. The frontend
proxies `/api` to the local API process. SQLite data is stored in `.data/soloop.db`.

You can sign in and manage projects without provider credentials. To enable AI,
copy `.env.example` to `.data/app.env`, set owner-only permissions (`chmod 600`),
fill in your Azure OpenAI resource/key and deployment name, then restart `dev:api`.
`SOLOOP_MODEL` chooses the supported logical model; `FOUNDRY_DEPLOYMENT` optionally
maps it to the deployment name in your own resource. Leave all credentials out of
Vite client variables. AI requests may incur provider charges.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript checks |
| `npm run lint` | ESLint |
| `npm test` | API/auth/task integration tests with an injected provider |
| `npm run build` | Production frontend build |
| `npm run smoke:production` | Built Node server routes and assets |
| `npm run start:node` | Frontend-only Node production preview |

`npm run install:ci` performs the locked dependency install, including native
optional build dependencies. CI runs typecheck, lint, tests, build, and production
smoke. The Node preview is frontend-only; running the whole workspace in production
also requires the API and a same-origin reverse proxy. See the optional
[self-hosting guide](deploy/AWS.md).

## Architecture

```text
Browser → frontend /api proxy → Node API → SQLite
                                  └──→ configured AI provider
```

| Path | Responsibility |
| --- | --- |
| `app/` | Page routes and metadata |
| `components/soloop/` | Public shell, authentication, and workspace UI |
| `components/ui/` | Shared UI primitives |
| `server/` | Authentication, authorization, storage, provider calls, task lifecycle |
| `styles/` | Original public-page and workspace styles |
| `deploy/` | Optional release, backup, systemd and nginx examples |
| `docs/` | Architecture, provenance, and verification guidance |

React 19, TypeScript, Vinext/Next-compatible routing, Vite, Tailwind 4, and Node's
SQLite support form the stack. See [architecture](docs/ARCHITECTURE.md) for trust
boundaries and [verification](docs/VERIFICATION.md) for the manual workflow.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md).
Documentation, accessibility, error recovery, and focused regression fixes are
useful entry points. Report sensitive issues through [SECURITY.md](SECURITY.md).
Original code and technical documentation are [MIT licensed](LICENSE); third-party
notices remain applicable.
