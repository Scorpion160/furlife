# Furlife v0.3.7 - Robust Flutter SDK download

## Problem
Windows PowerShell 5.1 `Invoke-WebRequest` can stall on the large Flutter SDK bundle and leave a zero-byte archive.

## Fix
- Keep the official Flutter release index as the source of truth.
- Prefer `curl.exe` for the large SDK archive with redirects, HTTP failure handling, and retries.
- Fall back to `Invoke-WebRequest` only when curl is unavailable.
- Reject zero-byte downloads before checksum/extraction.
- Preserve the existing SHA-256 verification from the official Flutter release index.

No application, database, or dependency change is required.
