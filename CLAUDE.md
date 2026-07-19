# CLAUDE.md

Guidance for agents working in this repo. The workout-tracker is a dependency-light,
no-build-step vanilla-JS PWA. Read `CONTEXT.md` (the domain glossary) and the ADRs in
`docs/adr/` before working in an area.

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name (`needs-triage`,
`needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
