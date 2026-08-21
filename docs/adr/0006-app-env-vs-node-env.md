# ADR-0006 - Separate APP_ENV from NODE_ENV

Status: Accepted

## Decision

Furlife uses `APP_ENV` (`development`, `test`, `staging`, `production`) for product/deployment-stage policy. `NODE_ENV` is not stored in the shared monorepo environment file and is left to frameworks such as Next.js and Jest.

## Why

The Admin and backend share one local environment. Next.js expects to control `NODE_ENV` during `next dev`/`next build`, while Furlife also needs a `staging` concept. Persisting `NODE_ENV=development` during a production build produced inconsistent prerender behavior.

## Consequences

- Backend security policy reads `APP_ENV`.
- Next.js controls `NODE_ENV` during build/runtime.
- Legacy local files are migrated automatically without rotating secrets.
