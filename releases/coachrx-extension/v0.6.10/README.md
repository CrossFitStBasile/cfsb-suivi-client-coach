# CoachRx Sync 0.6.10 — release candidate

This directory contains the minimal CoachRx extension candidate prepared on
2026-07-19 from the sealed 0.6.9 provenance release. It is not approved for
distribution. The exact ZIP is available only through the isolated Firebase
Hosting Preview channel documented in `RELEASE_VALIDATION_REPORT.md`; live
Hosting remains on 0.6.8.

## Status

- Version: `0.6.10`
- Status: `candidate_not_yet_approved_for_distribution`
- Artifact: `coachrx-sync-extension-0.6.10-live.zip`
- SHA-256: `84F2EC6CA8E9742ECDE13827686E6B9314BCDD7A512B02C41E6BE27003BF121D`
- Managed Apps Script route marker: `20260719-v79`
- Live Hosting rollback version: `0.6.8`

## Product delta from sealed 0.6.9

Only two runtime constants change:

1. `EXTENSION_VERSION`: `0.6.9` to `0.6.10`;
2. `ENDPOINT_ROUTE_RELEASE`: `20260718-v75` to `20260719-v79`.

The managed Apps Script URL and the complete extraction, authentication,
identity, counter, normalization and synchronization logic are identical to
the sealed 0.6.9 source. `test.mjs` verifies that exact source-level delta.

## Rebuild

From this directory, using PowerShell 7:

```powershell
pwsh -File .\build.ps1 -OutputPath "$env:TEMP\coachrx-sync-extension-0.6.10-rebuilt.zip"
```

The build refuses to overwrite an output, verifies the exact ten source
entries and fails unless the resulting ZIP matches the declared SHA-256.

## Test

```powershell
node .\test.mjs
```

The test validates the manifest and route marker, the exact delta from sealed
0.6.9, Bearer use without token leakage, the Marc-Andre 21 active plus 31
archived roster, the Iheb 42-active roster, coach and URL guards, incomplete
counts, unknown states, every declared source hash, and the exact ZIP root and
artifact hash.

See `RELEASE_VALIDATION_REPORT.md` for the reproducibility proof, remaining
end-to-end gates and rollback instructions.

## Distribution gate

Do not copy this ZIP to `firebase-dashboard/public`, update Hosting, deploy,
announce it or send it to coaches until the signed-in CoachRx pilot and the
seven-coach downstream ownership checks are complete.
