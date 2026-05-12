# Changelog

## [0.2.0](https://github.com/zeltjs/zelt/compare/openapi-v0.1.1...openapi-v0.2.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* **cli,contract:** loadZeltConfig and generateClient now return Promise instead of ResultAsync. Errors are thrown instead of returned as Err.

### Features

* **contract:** add error type definitions for ROP ([e1b967b](https://github.com/zeltjs/zelt/commit/e1b967b840f93d0abfb9ec34bed6b81aac354d49))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add target parameter to validated() for form-data support ([8a3e90f](https://github.com/zeltjs/zelt/commit/8a3e90ff88c3fa8419083502926957d36c9d12ca))
* **core:** add target parameter to validated() for form-data support ([171dd4b](https://github.com/zeltjs/zelt/commit/171dd4b041350aa1d6dd14c34116da37cc922563))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **openapi:** add requestValidator option to config ([8c35dc1](https://github.com/zeltjs/zelt/commit/8c35dc1e725d384d2b94f85a097e7df2f29099e7))
* **openapi:** add SchemaAdapter interface and ValidationErrorBody JSON Schema ([de802f3](https://github.com/zeltjs/zelt/commit/de802f3f234f4d713e38be86d174e2a6c8fa7bd7))


### Bug Fixes

* add adapter-node reference to tsconfig for CLI packages ([53ab8e5](https://github.com/zeltjs/zelt/commit/53ab8e542dc80637ecb008527c0e2f97b8d4953f))
* **contract:** add eslint-disable for complexity and line count ([7be044f](https://github.com/zeltjs/zelt/commit/7be044f4269793637449b390eebf9378ccec4832))
* **contract:** address CI lint and format issues ([ec4b686](https://github.com/zeltjs/zelt/commit/ec4b686464cd1bf337b60a4e6d5bc4a476b16a62))
* **contract:** fix import grouping in internal-representation.ts ([86f42a4](https://github.com/zeltjs/zelt/commit/86f42a4e89450cb0e8eb9d2ee2cb43ab1719a569))
* **contract:** fix import order in internal-representation.ts ([44b0b7f](https://github.com/zeltjs/zelt/commit/44b0b7fb29be691ebe03857c4ad193d6f09d8489))
* **contract:** refactor to avoid eslint complexity and line limits ([55f299f](https://github.com/zeltjs/zelt/commit/55f299f1a2cdf5de543679b737cb9e1b32a2500b))
* **contract:** replace switch/in with ts-pattern match ([03f8949](https://github.com/zeltjs/zelt/commit/03f8949b1ad1fa0126c5f2a8fea1687cc735203b))
* **contract:** separate parent and sibling import groups ([5dac16f](https://github.com/zeltjs/zelt/commit/5dac16f77d1506f039c810edd750b5761b074c6e))
* **lint:** resolve lint errors after main merge ([90766c3](https://github.com/zeltjs/zelt/commit/90766c36072fbb5b22de15162ff7991131c7dc67))
* **openapi:** handle REQUEST_VALIDATOR_REQUIRED in cli.ts ([093cddb](https://github.com/zeltjs/zelt/commit/093cddb6f597149bd30d22f6161ed63d43d1ceb6))
* remove unused cliWarn export ([3b56896](https://github.com/zeltjs/zelt/commit/3b56896d32632a89d8c82f4aa1a9a0522faa4031))


### Code Refactoring

* **cli,contract:** remove neverthrow from public API ([098bb3a](https://github.com/zeltjs/zelt/commit/098bb3a621b69f52ae8c641e9c7d5caf354ceb9a))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/adapter-node bumped to 0.2.0
  * devDependencies
    * @zeltjs/core bumped to 0.2.0
  * peerDependencies
    * @zeltjs/core bumped to 0.2.0

## [0.1.1](https://github.com/zeltjs/zelt/compare/openapi-v0.1.0...openapi-v0.1.1) (2026-05-05)


### Miscellaneous Chores

* **openapi:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.1.1
  * peerDependencies
    * @zeltjs/core bumped to 0.1.1

## [0.1.0](https://github.com/zeltjs/zelt/compare/openapi-v0.0.1...openapi-v0.1.0) (2026-05-05)


### Features

* **contract:** add GenerateClientOptions and defineConfig ([a78e28f](https://github.com/zeltjs/zelt/commit/a78e28f0e6f0ff3ceb758ababb09274197eadffe))
* **contract:** add koya-contract CLI with config auto-detect ([060f013](https://github.com/zeltjs/zelt/commit/060f0138bd5016e81e0fb5a995be5b85dc54ea5a))
* **contract:** add Route/BuildAppType/Extract* type functions ([a9c966a](https://github.com/zeltjs/zelt/commit/a9c966acde598016906012e854d110a8dc822295))
* **contract:** emit app.gen.ts with type references ([be01b86](https://github.com/zeltjs/zelt/commit/be01b865948b6c0479ab026b8a4080703212cec1))
* **contract:** emit OpenAPI 3.1 document with valibot/TS schema integration ([ef967fc](https://github.com/zeltjs/zelt/commit/ef967fcd0fde2457722a9a78136ccad505ab4f49))
* **contract:** implement generateClient orchestrator and watch loop ([d123861](https://github.com/zeltjs/zelt/commit/d123861a35bb00f88bdec538ceb4bf4b8f5e7f99))
* **contract:** implement ts-morph based controller analyzer ([d2268ff](https://github.com/zeltjs/zelt/commit/d2268ffb2793543232c4cf967b84319fbfa9aa2e))
* **contract:** scaffold @koya/contract package ([06cd1c6](https://github.com/zeltjs/zelt/commit/06cd1c63bb080e900eac21074f88b0424e8e2e13))
* **examples/hello:** adopt Phase 2 (2) API with hc&lt;AppType&gt; e2e test ([51e7f82](https://github.com/zeltjs/zelt/commit/51e7f82d5010398ea80cd1836ee56e1c64f972f9))
* Phase 2 (2) API Contract (AppType + OpenAPI) ([7eaf389](https://github.com/zeltjs/zelt/commit/7eaf38994429a47a2ed29109c9ee1f08cbef5cbf))


### Bug Fixes

* **ci:** allow whitelisted hono imports and silence knip noise ([e2a8c99](https://github.com/zeltjs/zelt/commit/e2a8c9987a75aa276bef265645ec581bba0f51e6))
* **contract:** correct import order in watch.ts ([8b13ee9](https://github.com/zeltjs/zelt/commit/8b13ee9d9233da9b35ca0e1b8894556afd6e074f))
* **contract:** scan all handler args for ValidatedMarker, not just first ([c4016f0](https://github.com/zeltjs/zelt/commit/c4016f03e31df18a2d70356809e2894a9a44a4e9))
* resolve biome and typescript lint errors ([22f5a4b](https://github.com/zeltjs/zelt/commit/22f5a4b400e5c51d290395469e7403dde9cb1ec5))
* resolve biome and typescript lint errors ([905da59](https://github.com/zeltjs/zelt/commit/905da59a3edcb0fac5ca9ec3baeeb7a4bdfec5c5))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/core bumped to 0.1.0
  * peerDependencies
    * @zeltjs/core bumped to 0.1.0
