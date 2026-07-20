# Firebase Rules Phase 1 tests

This suite runs only against Firebase Local Emulator Suite with the demo project
`demo-cfsb-dashboard-phase1`. It never connects to the live CFSB project.

Prerequisites:

- Node.js 22
- Java 21

Run from this directory:

```powershell
npm ci
npm test
```

The dedicated emulator configuration lives at
`../../firebase.phase1-rules-test.json` so Firebase CLI can load the repository
rules without ever pointing at the live `.firebaserc` project.

The tests cover canonical and bounded legacy Firestore reads, browser-write
denials for client/questionnaire authoritative data, coach-scoped operational
writes, immutable questionnaire bindings, self-only queues and self-only voice
note objects in Cloud Storage.
