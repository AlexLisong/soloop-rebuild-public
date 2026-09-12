# Architecture and trust boundaries

## Request path

The Vinext frontend renders routes and calls same-origin `/api` endpoints.
Development Vite proxies them to the loopback Node API. Production requires an
operator-configured reverse proxy. The API uses Node's SQLite driver for accounts,
sessions, projects, conversations, proposals, documents, and task status.

`server/app.mjs` owns request handling and task coordination; `store.mjs` owns
persistence; `provider.mjs` constructs bounded prompts and calls the configured
Azure OpenAI resource. `components/soloop/Workspace.tsx` renders saved state and
polls tasks; dialogs and the API client live in neighboring modules.

## Authorization and generation

Passwords use scrypt. Session tokens are opaque, stored hashed, and sent in
HttpOnly cookies with a strict same-site policy; production requires Secure
cookies. Mutations validate the configured origin and session CSRF token.
Ownership is checked server-side. Password changes revoke sessions. Persistent
throttles and task concurrency limits bound abuse in this small deployment model.

A proposal is persisted before approval. Approval creates a generation task;
duplicate approvals, late completion after cancellation, and conflicting document
edits are handled explicitly. Tasks survive browser navigation. Interrupted tasks
are marked failed after an API restart rather than pretending to resume execution.

Only project context, recent conversation, and bounded saved-work excerpts go to
the provider. It has no browsing, shell, publishing, or messaging tools. Rendering
Markdown does not permit raw HTML. The generated text remains untrusted content.

## Operational scope

The supported topology is one API process with local SQLite and a same-origin
frontend. Horizontal API scaling, shared task coordination, public multi-tenant
signup, and replicated storage are not implemented. Back up SQLite consistently,
protect backups as private data, and test restoration before relying on an
installation. The optional deployment examples are not required to contribute.
