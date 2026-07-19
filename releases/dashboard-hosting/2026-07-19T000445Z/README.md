# Dashboard Hosting — live provenance snapshot

This directory preserves the exact local source proven to match Firebase
Hosting on 2026-07-19. It is a provenance snapshot, not a deployment source and
not an approval to publish anything.

## Scope

- Firebase project/site: `cfsb-dashboard-coach-aa9a4`
- Observed Hosting publication: `2026-07-19T00:04:45Z`
- Public files preserved: 76
- Direct byte matches against live clean URLs: 71
- Historical extension ZIP routes intentionally redirecting to 0.6.8: 5
- Unexpected mismatches: 0

The copied `firebase.json` is retained as evidence of the Hosting routing. Its
Functions and Firestore declarations do not certify the corresponding backend
versions.

## Verify

```powershell
node .\verify.mjs
```

The verifier checks every file against `files.sha256`, verifies the captured
`firebase.json`, and confirms that no 0.6.9 package is present in this live
snapshot.

## Important limitations

- The live frontend was not represented by a clean commit before this snapshot.
- The exact deployed Cloud Functions and Firestore rules remain unknown until
  an authenticated live capture is completed.
- Hosting still distributes extension 0.6.8.
- This snapshot must never be deployed as a shortcut around review.
