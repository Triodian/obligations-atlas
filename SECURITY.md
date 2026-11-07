# Security policy

## Reporting a vulnerability

Please report security problems privately, through GitHub: open the **Security** tab of this repository and choose
**Report a vulnerability**. Do not open a public issue.

Include what you found, how to reproduce it, and what it could let someone do. We will acknowledge the report, keep you
informed while we fix it, and credit you when the fix is published, unless you would rather not be named.

## Supported versions

Only the latest `main` is supported. Deployments update from `main`.

## Scope

In scope: this repository's code and its default configuration. Out of scope: deployments run by others, denial of
service by volume, and findings that need an already compromised Cloudflare account or administrator.

Secrets are never kept in this repository. Configuration values in `wrangler.jsonc` (database ids, domains, the Access
team domain) are not secrets.
