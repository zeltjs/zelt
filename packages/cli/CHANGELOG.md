# Changelog

## [0.2.0](https://github.com/zeltjs/zelt/compare/cli-v0.0.1...cli-v0.2.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* **cli,contract:** loadZeltConfig and generateClient now return Promise instead of ResultAsync. Errors are thrown instead of returned as Err.
* **command:** add cliSchema and args() for improved CLI API

### Features

* add Scheduler and Command features ([e33df83](https://github.com/zeltjs/zelt/commit/e33df837fdc20d11fb485fc405b15246d80acc45))
* **cli:** add @zeltjs/cli package with build and dev commands ([f5b2de8](https://github.com/zeltjs/zelt/commit/f5b2de8b607aad67777247fb12015a7b79a6e9f0))
* **cli:** add @zeltjs/cli package with build and dev commands ([8c45856](https://github.com/zeltjs/zelt/commit/8c45856cb385692d2b290b177e69a45e71156ca1))
* **cli:** add command loader ([c90875b](https://github.com/zeltjs/zelt/commit/c90875bc9a52b4594d1ff02623cd4c93212ff15a))
* **cli:** add command runner ([c88bf35](https://github.com/zeltjs/zelt/commit/c88bf3576f5d459a47b26809fb9531eca7c14d1d))
* **cli:** add commands field to config schema ([1a9f951](https://github.com/zeltjs/zelt/commit/1a9f95125c1cfdc894e541aed643096e9baa8421))
* **cli:** add zelt run command ([b121e8a](https://github.com/zeltjs/zelt/commit/b121e8afd683c95569949400385e2005237309f3))
* **command:** add cliSchema and args() for improved CLI API ([c2124d7](https://github.com/zeltjs/zelt/commit/c2124d7be04d64abb2dfaba22cdc169e848fa0f7))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))


### Bug Fixes

* add adapter-node reference to tsconfig for CLI packages ([53ab8e5](https://github.com/zeltjs/zelt/commit/53ab8e542dc80637ecb008527c0e2f97b8d4953f))
* **cli:** add command package reference to tsconfig ([8bef9a3](https://github.com/zeltjs/zelt/commit/8bef9a30ec7d56a249a7ed4e813c844d39c02be7))
* **cli:** move tsdown to devDependencies and fix knip config ([927e126](https://github.com/zeltjs/zelt/commit/927e12607513ae2cb8a4274af71cda6d7d21fc73))
* **cli:** remove unused files and dependencies for knip ([cb8b4c8](https://github.com/zeltjs/zelt/commit/cb8b4c872466ceca7f5ddd47ab745cbc4176aef5))


### Code Refactoring

* **cli,contract:** remove neverthrow from public API ([098bb3a](https://github.com/zeltjs/zelt/commit/098bb3a621b69f52ae8c641e9c7d5caf354ceb9a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/adapter-node bumped to 0.2.0
    * @zeltjs/core bumped to 0.2.0
