# Frontend polish: todo

See `tasks/plan.md` for findings and acceptance criteria.

## Phase 1: broken
- [x] T1 Mobile replay map collapses (`lg:flex-1`)
- [x] T2 429 surfaced as rate limit, not "not found"; matches fetched after stats (+ pytest)
- [x] T3 Search input draft state separate from loaded `playerName`
- [x] Checkpoint A: typecheck, lint, jest, pytest, ruff, screenshots

## Phase 2: polish
- [x] T4 Delete overflowing toast
- [x] T5 Empty match list state
- [x] T6 "Survived" label for `Duration`
- [x] T7 `toLocaleString` + visible damage icon
- [x] T8 Distinct speed controls; drop fake "Live feed"
- [x] Checkpoint B

## Phase 3: match page flow
- [x] T9 Auto-load replay (stats stay on top, per user)
- [x] T10 sessionStorage so refresh keeps the match page
- [ ] T11 (optional) Map PNG → WebP
- [x] Checkpoint C: BACKLOG updated
