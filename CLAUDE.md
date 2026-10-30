# halloween-micro

Haunted Portrait — MVP Requirements

Built with a multi-agent pipeline: requirements analyst → developer → tester → pull request. A human reviews and merges every PR.

## Stack

To be defined by the first feature (MVP). The developer fills this in after scaffolding.

## Commands

To be defined by the first feature. List install, dev server, build, unit test and end-to-end test commands here.

## Structure

To be defined by the first feature.

- `docs/specs/`: feature specs written by the requirements analyst
- `docs/test-cases/`: test cases (TC-n, with steps and expected results) written by the tester
- `docs/test-reports/`: test reports written by the tester
- Bugs found in testing are filed as GitHub issues labeled `bug` and `severity: *`. Fix commits reference the issue (`fix: ... (#12)`), and PRs close them with `Fixes #12`.

## Conventions

- Everything in the repository is written in English: code, comments, docs, commit messages, PR descriptions.
- Keep business logic in pure, testable functions, separate from UI code.
- Never render user input as HTML.
- Prefer accessible markup (labels, roles, `aria-*`). End-to-end tests locate elements with `getByRole`, `getByLabel` and `getByText` where possible.
- Name tests after behavior. Acceptance tests start with their criterion ID, for example `AC-2: rejects a blank title`.
- Commits follow Conventional Commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Feature branches are named `feature/<slug>`, or keep the branch Claude Code created for a worktree session. Never commit to `main`.

## Definition of done

- Every acceptance criterion in the spec is covered by at least one test.
- Build, unit tests and end-to-end tests all pass.
- No unrelated changes in the diff.
