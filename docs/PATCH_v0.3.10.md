# Furlife v0.3.10 - Sprint 0 consolidation

v0.3.10 consolidates the locally validated Windows bootstrap after v0.3.9 reached a full PASS.

## Changes

- keeps Node 22.16.0, pnpm 9.15.4, Prisma 6.5.0, and Flutter 3.44.9 stable pinned;
- keeps the Windows doctor fix that invokes `.cmd` / `.bat` launchers through `cmd.exe`;
- replaces the Admin placeholder test with a real HTTP smoke test against a temporary local Next.js development server;
- verifies HTTP 200, French document language, Furlife Admin metadata, and the Administration heading;
- aligns bootstrap version markers to v0.3.10;
- strengthens structural verification so the placeholder Admin test cannot return.

No dependency major upgrade is part of this patch.
