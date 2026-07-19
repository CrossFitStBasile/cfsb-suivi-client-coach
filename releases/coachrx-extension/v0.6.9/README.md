# CoachRx Sync 0.6.9 — provenance baseline

This directory preserves the exact CoachRx extension artifact tested on
2026-07-19. It is a provenance baseline, not an approval to distribute it.

## Status

- Version: `0.6.9`
- Artifact: `coachrx-sync-extension-0.6.9-live.zip`
- SHA-256: `8DCD90C3B1CCC2872430B0B60B2BFE7D60C6E4A3ED8A21CA9857FD2BF0008D30`
- Distribution status: `NO-GO`
- Live Hosting still serves the prior `0.6.8` package.

The source under `source/` was extracted byte-for-byte from the tested ZIP.
The build script restores the ZIP entry timestamps and must reproduce the
exact hash above on Windows PowerShell.

## Rebuild

From this directory:

```powershell
pwsh -File .\build.ps1 -OutputPath "$env:TEMP\coachrx-sync-extension-0.6.9-rebuilt.zip"
```

The command fails when the output already exists or when the rebuilt hash is
not exact. PowerShell 7 is required because Windows PowerShell 5.1 uses a
different ZIP implementation and cannot reproduce the tested bytes.

## Test

```powershell
node .\test.mjs
```

The test covers a complete roster, an incomplete active roster, an incomplete
archived roster, and an unknown CoachRx state. It also verifies that the
CoachRx session token is not returned in the extraction result.

## Known release blocker

The extension declares route release `20260718-v75`, while the protected Apps
Script Web Apps currently point to version 79. This baseline must therefore not
be copied to Hosting or announced to coaches. Any code correction requires a
new extension version rather than silently replacing this ZIP.
