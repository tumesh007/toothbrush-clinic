# Contributing to Toothbrush Clinic

Thank you for your interest in contributing!

## Getting started

```bash
git clone https://github.com/tumesh007/toothbrush-clinic
cd toothbrush-clinic
npm install
npm run dev
```

## Branch convention

- `master` — stable, released
- `feature/<name>` — new features
- `fix/<name>` — bug fixes
- `docs/<name>` — documentation only

## Before submitting a PR

1. Run `npx vitest run` — all 96 tests must pass.
2. Run `npm run build` — production build must succeed.
3. Do not change tooth IDs, zone IDs, surface counts, or the manifest without updating the corresponding tests.
4. Do not add runtime network requests, analytics, accounts, or tracking.

## Dental protocol rules

The protocol is the core correctness guarantee of the app. When modifying `protocol/`:

- Tooth count must remain **28**.
- Manifest must remain **72 entries** (28 outer + 28 inner + 16 chewing).
- Zone IDs must remain stable (voice instruction map in `BrushingController.ts` depends on them).
- Duration allocation must be exact (`computedTotal === requestedBrushingDuration`).

## Regenerating the 3D model

```bash
python3 -m venv venv
venv/bin/pip install trimesh numpy
venv/bin/python scripts/create_mouth_v2.py
```

Verify the new model has exactly 72 named tooth meshes before committing.

## Code style

- TypeScript strict mode (no `any` unless absolutely necessary).
- Pure functions for protocol logic — no side effects in `protocol/`.
- Ports pattern for all I/O — never call `window.speechSynthesis` directly from the state machine or controller.
