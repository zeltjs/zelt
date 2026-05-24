# Integration Tests

Integration tests following NestJS pattern - each feature has its own mini-app and e2e tests.

## Structure

```
integration/
├── hello-world/           # Basic HTTP test
│   ├── src/              # App code
│   │   ├── app.ts
│   │   └── hello.controller.ts
│   └── e2e/              # E2E tests
│       └── hello-world.spec.ts
├── scripts/
│   ├── switch-mode.sh    # Switch between workspace/pack modes
│   └── run-tests.sh      # Run integration tests
└── README.md
```

## Usage

### Run tests in workspace mode (development)

```bash
./integration/scripts/run-tests.sh workspace
```

### Run specific test

```bash
./integration/scripts/run-tests.sh workspace hello-world
```

## Modes

| Mode | Description | Status |
|------|-------------|--------|
| `workspace` | Uses `workspace:*` links | ✅ Working |
| `pack` | Uses `npm pack` tarballs | ⚠️ WIP - pnpm dependency resolution issues |

## Adding new tests

1. Create a new directory under `integration/`
2. Add `package.json`, `tsconfig.json`, `vitest.config.ts`
3. Create `src/` for app code and `e2e/` for tests
4. Use `@zeltjs/testing` for test utilities
