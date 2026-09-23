# Changelog

Versioning rules: see [OPERATIONS.md → Versioning](OPERATIONS.md#versioning).
MAJOR = something people must prepare for · MINOR = new user-visible capability
· PATCH = fixes, copy, dependency/security updates.

## 1.3.6 — 2026-09-23

- Sidebar version label shows the version number only (build id removed).

## 1.3.5 — 2026-09-23

First versioned release. Earlier history lives in git (`git log`).

- Sidebar shows the app version and build id under Contact Support.
- Reset-PIN page explains that codes expire after 15 minutes and that only
  the code in the most recent email works.
- Runtime moved to Node 24 LTS (Node 20 reached end-of-life).
- Security updates: Next.js 16.3.6, nodemailer 9.1.1, mermaid 10.9.8 and
  transitive dependencies — `npm audit` reports 0 vulnerabilities.
