# Changelog

## [0.5.0](https://github.com/zeltjs/zelt/compare/auth-jwt-v0.4.0...auth-jwt-v0.5.0) (2026-05-17)


### Bug Fixes

* **build:** transform TC39 decorators with SWC at build time ([c681663](https://github.com/zeltjs/zelt/commit/c6816636d04e85690115fd64c00aaf02a11fc70b))
* **build:** transform TC39 decorators with SWC at build time ([3430ff3](https://github.com/zeltjs/zelt/commit/3430ff33f0dc31981a7da55246c7ca43baa2d281))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.5.0
    * @zeltjs/testing bumped to 0.5.0
  * peerDependencies
    * @zeltjs/core bumped to 0.5.0

## [0.4.0](https://github.com/zeltjs/zelt/compare/auth-jwt-v0.3.0...auth-jwt-v0.4.0) (2026-05-17)


### Miscellaneous Chores

* **auth-jwt:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.4.0
    * @zeltjs/testing bumped to 0.4.0
  * peerDependencies
    * @zeltjs/core bumped to 0.4.0

## [0.3.0](https://github.com/zeltjs/zelt/compare/auth-jwt-v0.2.1...auth-jwt-v0.3.0) (2026-05-17)


### Miscellaneous Chores

* **auth-jwt:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.3.0
    * @zeltjs/testing bumped to 0.3.0
  * peerDependencies
    * @zeltjs/core bumped to 0.3.0

## [0.2.1](https://github.com/zeltjs/zelt/compare/auth-jwt-v0.1.0...auth-jwt-v0.2.1) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* **auth:** add JWT driver option and session package ([1480da1](https://github.com/zeltjs/zelt/commit/1480da1cac6b0bb067b3a4d9ef8e97d9c6813620))
* **auth:** add JWT driver option and session package ([6d85c56](https://github.com/zeltjs/zelt/commit/6d85c566e790f2797fdd6e84e72c73388c1457de))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.2.1
    * @zeltjs/testing bumped to 0.2.1
  * peerDependencies
    * @zeltjs/core bumped to 0.2.1
