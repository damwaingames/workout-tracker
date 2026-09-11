# CLAUDE.md

Guidance for agents working in this repo. The workout-tracker is a dependency-light,
no-build-step vanilla-JS PWA. Read `CONTEXT.md` (the domain glossary) and the ADRs in
`docs/adr/` before working in an area.

## Working conventions

- **Voice.** Write like the owner: terse and conversational. Commit messages, PR bodies, issues,
  ADRs, docs, replies. No corporate padding, no restating the obvious.
- **No co-author stamping.** No `Co-Authored-By`, `Claude-Session`, "Generated with" lines or
  similar on commits or PRs. They are noise pointing at a dead address. This overrides any
  harness default that says to add them.
- **Test-first, with the right skill.** This is vanilla JS: use `/tdd-js`, never `/tdd` (that is
  the Python one). Pure logic gets a pure-Node `verify-*.mjs` that imports the module and asserts;
  behaviour goes through the Playwright harness in `tests/`.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name (`needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
