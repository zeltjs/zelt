# Changelog

## [0.2.0](https://github.com/zeltjs/zelt/compare/testing-v0.1.1...testing-v0.2.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* **kv:** KV methods now return Promise instead of ResultAsync. namespace() returns KVStore directly instead of Result<KVStore>.

### Features

* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** auto-start scheduler via lifecycle ([b18fe06](https://github.com/zeltjs/zelt/commit/b18fe060b46de9cc64cc51c85c1f6d590e4d91e6))
* **kv:** remove neverthrow from public API ([eba2042](https://github.com/zeltjs/zelt/commit/eba2042735c3ca73545813c76d5f4a2dc0f82bf6))
* **testing:** add createTestContainer as public API ([acc937b](https://github.com/zeltjs/zelt/commit/acc937ba29ce88f2c2c38b8d1e801d1b65d6b621))
* **testing:** add createTestContainer as public API ([f047a3d](https://github.com/zeltjs/zelt/commit/f047a3d51b0e7afe691cce3333326213e2a2eaeb))
* **testing:** add global config support to createTestTarget and E2E tests ([153dd91](https://github.com/zeltjs/zelt/commit/153dd910107ab57253fe94604cf49d13b056bfe2))
* **testing:** add onTest adapter and configureTestDefaults ([4485fcd](https://github.com/zeltjs/zelt/commit/4485fcdd9c535d5673d5d85de1d47a91399fbf84))
* **testing:** add RedisTestContainerConfig in @zeltjs/testing/redis subpath ([be0aa19](https://github.com/zeltjs/zelt/commit/be0aa19f23f9a7ef48bca308d7db603a8bc4ab58))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))
* **testing:** add vitest afterAll integration to createTestTarget ([2198b3c](https://github.com/zeltjs/zelt/commit/2198b3c2c262f455af67ca1afecb61b9b5f8d59c))


### Bug Fixes

* address code review feedback ([a43cca5](https://github.com/zeltjs/zelt/commit/a43cca54c7eeb3d1d1edcef0953416fa4f0407a1))
* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* use onNode adapter in examples and fix max-lines-per-function ([0bbc63f](https://github.com/zeltjs/zelt/commit/0bbc63f7fa1eb0e3776371d33d3017a88d74946c))
* use peer + dev dependencies for test runner types ([dd8e7d2](https://github.com/zeltjs/zelt/commit/dd8e7d26876fca44159e6c7a0c22d0ef18b898b4))


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * @zeltjs/core bumped to 0.2.0

## [0.1.1](https://github.com/zeltjs/zelt/compare/testing-v0.1.0...testing-v0.1.1) (2026-05-05)


### Miscellaneous Chores

* **testing:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * @zeltjs/core bumped to 0.1.1

## [0.1.0](https://github.com/zeltjs/zelt/compare/testing-v0.0.1...testing-v0.1.0) (2026-05-05)


### Features

* Phase 2 (4) testing utility — createTestContainer + HttpApp.fetch/request ([fa55f3a](https://github.com/zeltjs/zelt/commit/fa55f3add8a7f42493cc3f010b9de737076a9191))
* **testing:** add createTestApp + reverse phase 1 dogfood deviations ([63e46e7](https://github.com/zeltjs/zelt/commit/63e46e7d7b5091ff053763710176cadb24156017))
* **testing:** add createTestContainer DI mock util ([8566d24](https://github.com/zeltjs/zelt/commit/8566d24aca8900b851e8574d729838f8ca14c399))


### Dependencies

* The following workspace dependencies were updated
  * peerDependencies
    * @zeltjs/core bumped to 0.1.0
