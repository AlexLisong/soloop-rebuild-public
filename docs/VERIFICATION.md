# Verification guide

Use Node.js from `.nvmrc` and install with `npm run install:ci`.

## Automated checks

Run typecheck, lint, `npm test`, build, and `npm run smoke:production` as shown in
the README. CI runs the same sequence. API integration groups cover sessions,
CSRF/origin enforcement, expiry/logout/password changes, throttles, owner isolation,
approval idempotency, document conflicts, cancellation, provider failures,
restart recovery, bounded prompts, and allowed models.

Tests use synthetic data and a provider stub. Passing them does not verify a live
provider resource, delivery latency, or an operator's deployment configuration.
The production smoke starts a temporary Node frontend server and checks seven
page routes, the start redirect, a 404, and homepage-linked assets.

## Manual browser checklist

1. Start the API and frontend with a newly provisioned local account.
2. Open the homepage and its About, privacy, cookies, and limitations pages.
3. Use keyboard navigation and the skip link. Check desktop and phone widths
   for overflow, clipped text, and legible controls.
4. Open the workspace while signed out. Confirm login focus and form validation;
   Escape should return to the homepage. Sign in with the local test account.
5. Create a synthetic project and save its brief. Reload and confirm persistence.
6. With a test provider configured, send a chat, request a proposal, approve it,
   and inspect the generated document. Edit and download it.
7. Navigate away during a task, return, cancel another task, and inspect error
   states. Verify that unapproved proposals do not generate documents.
8. Sign out and confirm that saved workspace data is no longer accessible.

Use synthetic content only. Do not attach credentials, private prompts, provider
identifiers, full database dumps, or real host information to issues or PRs.
Record exact commands and observed results with each change rather than treating
this checklist as evidence that every environment has been verified.
