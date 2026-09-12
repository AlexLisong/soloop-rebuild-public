# Optional self-hosting on Linux

These are reusable Linux/systemd/nginx examples. They contain no maintainer host,
account, DNS, or provider configuration. Local development requires none of them.
Review and adapt the scripts to your own infrastructure before running as root.

## Topology and prerequisites

Use Node.js 22.13+ at `/usr/bin/node`, Python 3.12+, npm, nginx, Certbot, and common
Linux tools (`flock`, `runuser`, `curl`). The frontend and API run as separate
unprivileged users on loopback ports 8013 and 8014. nginx serves the chosen hostname
and proxies `/api` to the API process. DNS must point to your host; certificate
issuance requires a registered Certbot account and reachable HTTP challenges.

Runtime state is separate from release code: `/var/lib/soloop/soloop.db`, a
root-owned `/etc/soloop/app.env` with mode 0600, and private backups. Set the same
`APP_ORIGIN=https://workspace.example.com` as your chosen public hostname. Supply
`FOUNDRY_RESOURCE`, `FOUNDRY_API_KEY`, `SOLOOP_MODEL`, and optional
`FOUNDRY_DEPLOYMENT` in that private environment file. The API requires a configured
provider in production. Never bundle that file into a release.

## Build and activate

After testing and committing your source, `npm run package:release` builds and
checks a clean revision and writes an allowlisted archive with SHA-256 metadata
under ignored `.aws/`. Transfer the archive and installer to your own host using
a trusted SSH connection. Set your public hostname explicitly:

```sh
sudo env SOLOOP_HOST=workspace.example.com bash deploy/install-release.sh /path/to/release.tar.gz
```

The installer locks concurrent deployment, validates the archive, installs
packages as an unprivileged user, makes release code root-owned, pauses API
writes, takes a consistent SQLite backup, and activates the release. It renders
hostname placeholders in the nginx configuration and certificate-renewal hook,
checks service/HTTPS health, and restores code/configuration/data on failed
activation. Failed rollback leaves recovery material and maintenance protection
in place for an operator to resolve.

Set `FOUNDRY_DEPLOYMENT` explicitly when migrating an installation whose Azure
deployment name differs from the logical `SOLOOP_MODEL`. No tenant-specific model
alias is compiled into the application.

## Provision an account

Run `server/admin.mjs provision` under the appropriate API identity with
`SOLOOP_DB` pointing at the installation database. Choose a new private handoff
file path and deliver its credentials privately. Do not put them in issues or
source control. `reset-password` requires a new handoff path and revokes sessions;
do not reset an existing owner merely to test a deployment.

## Backups and recovery

The provided timer creates WAL-consistent backups with 30-day daily retention.
Those backups remain on the host unless you configure off-host storage. Protect
and test backup restoration; snapshots contain private account and project data.
Review the installer rollback steps before manually changing a release. Keep the
API stopped during database restoration and remove stale WAL/SHM files only as
part of a documented consistent restore procedure.

After activation, verify HTTPS, sign-in/out, a synthetic project, provider error
handling, document editing, downloads, restart behavior, and any other applications
sharing the host. Never infer readiness from a homepage-only check.
