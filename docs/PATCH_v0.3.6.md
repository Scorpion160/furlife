# Furlife v0.3.6 - Admin build environment fix

## Fixed
- Replaced shared `NODE_ENV` with Furlife-owned `APP_ENV`.
- Legacy `.env.local` files are migrated automatically without rotating secrets.
- Windows and Linux bootstraps clear inherited `NODE_ENV` before framework builds.
- Admin `tsconfig.json` now contains Next.js-required options before the first build, so `next build` no longer mutates tracked configuration.
- Added ADR-0006 documenting the environment convention.

## Why
The Admin build received `NODE_ENV=development` from the monorepo `.env.local`. Next.js expects to control `NODE_ENV` itself during `next build`; the inherited value triggered a non-standard environment warning and inconsistent prerender behavior.
