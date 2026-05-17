# Changelog

## [0.3.0](https://github.com/zeltjs/zelt/compare/rate-limit-v0.2.1...rate-limit-v0.3.0) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** MiddlewareInstance.use() signature now includes options parameter
* **rate-limit:** adapt to new KV API (Promise/throw)
* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **rate-limit:** adapt to new KV API (Promise/throw) ([fe3679b](https://github.com/zeltjs/zelt/commit/fe3679b780909b2edb81a9eb8011b8bc2bd4650c))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **rate-limit:** add validate-valibot to tsconfig references ([632d4da](https://github.com/zeltjs/zelt/commit/632d4dad2b1985a9910550e621b9cf5042999ee1))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.3.0
    * @zeltjs/kv bumped to 0.3.0
    * @zeltjs/validator-valibot bumped to 0.3.0
  * peerDependencies
    * @zeltjs/core bumped to 0.3.0
    * @zeltjs/kv bumped to 0.3.0

## [0.2.1](https://github.com/zeltjs/zelt/compare/rate-limit-v0.1.0...rate-limit-v0.2.1) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** MiddlewareInstance.use() signature now includes options parameter
* **rate-limit:** adapt to new KV API (Promise/throw)
* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **rate-limit:** adapt to new KV API (Promise/throw) ([fe3679b](https://github.com/zeltjs/zelt/commit/fe3679b780909b2edb81a9eb8011b8bc2bd4650c))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **rate-limit:** add validate-valibot to tsconfig references ([632d4da](https://github.com/zeltjs/zelt/commit/632d4dad2b1985a9910550e621b9cf5042999ee1))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.2.1
    * @zeltjs/kv bumped to 0.2.1
    * @zeltjs/validator-valibot bumped to 0.2.1
  * peerDependencies
    * @zeltjs/core bumped to 0.2.1
    * @zeltjs/kv bumped to 0.2.1
