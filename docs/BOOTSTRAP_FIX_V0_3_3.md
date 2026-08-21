# Bootstrap fix v0.3.3

This corrective baseline targets Windows PowerShell 5.1 compatibility.

## Fixed

- `scripts/bootstrap-windows.ps1` is ASCII-only and has no UTF-8 BOM.
- Typographic apostrophes and accented executable strings were removed from the PowerShell script.
- Baseline verification now fails if non-ASCII bytes or a BOM are reintroduced into the Windows bootstrap.
- The PostgreSQL readiness command remains quoted safely while staying ASCII-only.

## Why

Windows PowerShell 5.1 can misparse smart punctuation in single-quoted strings depending on file encoding. The v0.3.2 bootstrap therefore failed at parse time before executing any environment or Docker step.
