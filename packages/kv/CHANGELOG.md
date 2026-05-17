# Changelog

## [0.3.0](https://github.com/zeltjs/zelt/compare/kv-v0.2.1...kv-v0.3.0) (2026-05-17)


### ⚠ BREAKING CHANGES

* **kv:** KV methods now return Promise instead of ResultAsync. namespace() returns KVStore directly instead of Result<KVStore>.

### Features

* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* add @zeltjs/redis and @zeltjs/eventbus packages ([a84741c](https://github.com/zeltjs/zelt/commit/a84741c194935601239693730694370c3a33d714))
* add @zeltjs/redis and @zeltjs/eventbus packages ([0979e0e](https://github.com/zeltjs/zelt/commit/0979e0e86601936861782076e98ba5cd74eb0b8c))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **kv:** implement Lifecycle interface in MemoryKV with auto-registration ([fd97bd5](https://github.com/zeltjs/zelt/commit/fd97bd57f4fe06a954821c68295aa6c1db7ce2cd))
* **kv:** remove neverthrow from public API ([eba2042](https://github.com/zeltjs/zelt/commit/eba2042735c3ca73545813c76d5f4a2dc0f82bf6))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.3.0
    * @zeltjs/redis bumped to 0.3.0
  * peerDependencies
    * @zeltjs/core bumped to 0.3.0
    * @zeltjs/redis bumped to 0.3.0

## [0.2.1](https://github.com/zeltjs/zelt/compare/kv-v0.1.0...kv-v0.2.1) (2026-05-17)


### ⚠ BREAKING CHANGES

* **kv:** KV methods now return Promise instead of ResultAsync. namespace() returns KVStore directly instead of Result<KVStore>.

### Features

* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* add @zeltjs/redis and @zeltjs/eventbus packages ([a84741c](https://github.com/zeltjs/zelt/commit/a84741c194935601239693730694370c3a33d714))
* add @zeltjs/redis and @zeltjs/eventbus packages ([0979e0e](https://github.com/zeltjs/zelt/commit/0979e0e86601936861782076e98ba5cd74eb0b8c))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **kv:** implement Lifecycle interface in MemoryKV with auto-registration ([fd97bd5](https://github.com/zeltjs/zelt/commit/fd97bd57f4fe06a954821c68295aa6c1db7ce2cd))
* **kv:** remove neverthrow from public API ([eba2042](https://github.com/zeltjs/zelt/commit/eba2042735c3ca73545813c76d5f4a2dc0f82bf6))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.2.1
    * @zeltjs/redis bumped to 0.2.1
  * peerDependencies
    * @zeltjs/core bumped to 0.2.1
    * @zeltjs/redis bumped to 0.2.1
