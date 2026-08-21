# Bootstrap fix v0.3.4

## Cause observed on Windows

The bootstrap intentionally runs pnpm through Corepack so it does not need an administrator-installed global shim. The root lifecycle scripts still invoked `pnpm` directly. When `corepack pnpm verify` entered the lifecycle, Windows could not resolve a global `pnpm` executable.

## Fix

- every root workspace script now invokes `corepack pnpm`;
- the baseline doctor enforces this invariant;
- the stale duplicate `apps/admin/src/app` router was removed before it could conflict with the canonical `apps/admin/app` router;
- app/bootstrap version markers moved to v0.3.4.

The generated lockfile and Prisma migration from v0.3.3 remain valid inputs when copied into v0.3.4.
