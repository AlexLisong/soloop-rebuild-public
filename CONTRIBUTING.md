# Contributing to Founder Workspace

Start with the [README](README.md), [architecture](docs/ARCHITECTURE.md), and
[code of conduct](CODE_OF_CONDUCT.md). Open an issue for larger changes so scope
and tradeoffs can be discussed before implementation. There is no guaranteed
maintainer response schedule.

## Local workflow

Fork, create a descriptive branch, and follow the README setup. Provision a local
account with synthetic project content. Tests use an injected provider and do not
need API credentials. Do not use a maintainer's installation or private data.

Keep changes focused. Preserve TypeScript checks and existing component patterns.
Use the installed dialog and form primitives for keyboard/focus behavior. Keep
provider credentials and authorization in the Node API; never trust client-supplied
owner IDs, prices, task states, or approval decisions.

## Checks before a pull request

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke:production
```

Add a regression test when changing authorization, persistence, or task behavior.
For UI changes, use [the manual checklist](docs/VERIFICATION.md), including narrow
viewports, keyboard navigation, loading/error states, and document editing.
Use only synthetic data in screenshots and logs.

Explain the problem, resulting behavior, verification, and any compatibility
change in your PR. Call out database changes and recovery implications. Avoid
committing `.data/`, `.aws/`, credentials, screenshots with private information,
local provider/host identifiers, or generated build output.

Original code and documentation contributions use the MIT license. Preserve
third-party notices. Do not reintroduce copied branding, testimonials, policy
text, photographs, or fonts without explicit redistribution rights and source
attribution. See [provenance](docs/PROVENANCE.md).
