---
applyTo: '**'
---

## Unit Test Guidelines

### Test Framework
- Use Vitest.
- Place test files under `src/` and name them `*.test.ts`.

### How to Run
- Run the full test suite:
  - npm run test
- Run in watch mode:
  - npm run test:watch

### Authoring Rules
- Write unit tests with Vitest `describe` / `it` / `expect`.
- Organize tests around functional modules.
- Prioritize coverage for pure functions and directly testable logic such as utils, DB query logic, and access control.
- For route tests, prefer reusing shared test factories instead of rebuilding `BlogDb` mocks, site config, and auth state in every test file.
- For route tests that submit forms, prefer shared helpers that consistently wrap `application/x-www-form-urlencoded` and `URLSearchParams` rather than duplicating ad hoc form construction in each test file.
