# Furlife v0.3.9 - System Flutter stable reuse

- Pin Flutter to 3.44.9 stable.
- Reuse an exact 3.44.9 stable system Flutter installation instead of downloading a duplicate SDK.
- Keep the portable verified SDK fallback only when no exact stable system SDK is available.
- Developer doctor now validates both Flutter version and channel.
- CI pin aligned to Flutter 3.44.9 stable.

This patch intentionally does not modify user secrets, pnpm lockfiles, Prisma migrations, Docker volumes, or Flutter system cache contents.
