# Changelog

## [0.3.0](https://github.com/zeltjs/zelt/compare/cli-v0.2.1...cli-v0.3.0) (2026-05-17)


### Miscellaneous Chores

* **cli:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/adapter-node bumped to 0.3.0
    * @zeltjs/core bumped to 0.3.0

## [0.2.1](https://github.com/zeltjs/zelt/compare/cli-v0.0.1...cli-v0.2.1) (2026-05-17)


### ⚠ BREAKING CHANGES

* **cli,contract:** loadZeltConfig and generateClient now return Promise instead of ResultAsync. Errors are thrown instead of returned as Err.
* **command:** add cliSchema and args() for improved CLI API

### Features

* **cli:** add entry and plugins fields to ZeltConfig schema ([f72fd12](https://github.com/zeltjs/zelt/commit/f72fd122e6aa517e383e55a111443eb9ed1568dd))
* **cli:** add plugin system for extensible build hooks ([a2b188f](https://github.com/zeltjs/zelt/commit/a2b188fc079b3367242dd80b48c18422cbc16002))
* **cli:** add runPreBuildHooks for plugin execution ([a991006](https://github.com/zeltjs/zelt/commit/a991006207ad98fbe9e9a96cfa31a9d663851a9e))
* **cli:** add ZeltPlugin and BuildContext types ([d7d0fb4](https://github.com/zeltjs/zelt/commit/d7d0fb405805f3c799058a19a54f4fcd78af6294))
* **cli:** export ZeltPlugin and BuildContext types ([dce29fa](https://github.com/zeltjs/zelt/commit/dce29fa164be1ced8684b4547a27b33d314ef933))
* **cli:** integrate preBuild hooks into build command ([2015cd7](https://github.com/zeltjs/zelt/commit/2015cd7e2a01d76d6a10d90fb9d88b1a5fe0e86d))
* **cli:** integrate preBuild hooks into dev server ([7a118a3](https://github.com/zeltjs/zelt/commit/7a118a31658bf10cd5100a62a8a0d9fa77faa39d))
* **command:** add cliSchema and args() for improved CLI API ([c2124d7](https://github.com/zeltjs/zelt/commit/c2124d7be04d64abb2dfaba22cdc169e848fa0f7))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))


### Bug Fixes

* add adapter-node reference to tsconfig for CLI packages ([53ab8e5](https://github.com/zeltjs/zelt/commit/53ab8e542dc80637ecb008527c0e2f97b8d4953f))
* **cli,openapi:** handle plugin errors in dev server and add missing devDep ([5b8b586](https://github.com/zeltjs/zelt/commit/5b8b58690426855385c08c87edba270ca06cb92b))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Code Refactoring

* **cli,contract:** remove neverthrow from public API ([098bb3a](https://github.com/zeltjs/zelt/commit/098bb3a621b69f52ae8c641e9c7d5caf354ceb9a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/adapter-node bumped to 0.2.1
    * @zeltjs/core bumped to 0.2.1
