# Security policy

Security fixes target the current default branch. There are no maintained older
release lines or promised response times at this stage.

## Report privately

Use **Security → Report a vulnerability** on the GitHub repository when that
option is available. Its availability depends on repository settings; this file
does not imply that private vulnerability reporting has been enabled.

If the option is absent, open an issue titled “Private security contact requested”
with no vulnerability details, or use a private contact listed on a maintainer's
GitHub profile. Wait for a private channel before sending a reproduction. Never
put credentials, private data, exploit details, or real deployment addresses in
public issues or pull requests.

Include the affected revision, impact, a minimal reproduction with synthetic
data, and any suggested fix. Give maintainers a reasonable opportunity to
investigate and coordinate disclosure. Test only systems you own or have
permission to assess.

## Contributing safely

Keep local configuration, keys, account handoffs, generated logs, and runtime data
out of Git. Review staged diffs and archives as well as source files. Redact
screenshots. If a credential was committed, removing its current file is not
enough: revoke or rotate it and review repository history before publication.
