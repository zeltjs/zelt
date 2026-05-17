# Changelog

## [0.4.0](https://github.com/zeltjs/zelt/compare/openapi-v0.3.0...openapi-v0.4.0) (2026-05-17)


### Miscellaneous Chores

* **openapi:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/cli bumped to 0.4.0
  * peerDependencies
    * @zeltjs/cli bumped to 0.4.0
    * @zeltjs/core bumped to 0.4.0

## [0.3.0](https://github.com/zeltjs/zelt/compare/openapi-v0.2.1...openapi-v0.3.0) (2026-05-17)


### Miscellaneous Chores

* **openapi:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/cli bumped to 0.3.0
  * peerDependencies
    * @zeltjs/cli bumped to 0.3.0
    * @zeltjs/core bumped to 0.3.0

## [0.2.1](https://github.com/zeltjs/zelt/compare/openapi-v0.2.0...openapi-v0.2.1) (2026-05-17)


### Features

* **cli:** add plugin system for extensible build hooks ([a2b188f](https://github.com/zeltjs/zelt/commit/a2b188fc079b3367242dd80b48c18422cbc16002))
* **cli:** export ZeltPlugin and BuildContext types ([dce29fa](https://github.com/zeltjs/zelt/commit/dce29fa164be1ced8684b4547a27b33d314ef933))
* **openapi:** add openapiPlugin for CLI integration ([f0db5fa](https://github.com/zeltjs/zelt/commit/f0db5fae0eac846c6498d828ddca1d9f3aa3b413))


### Bug Fixes

* **cli,openapi:** handle plugin errors in dev server and add missing devDep ([5b8b586](https://github.com/zeltjs/zelt/commit/5b8b58690426855385c08c87edba270ca06cb92b))
* correct website URL in package README files ([35e5de8](https://github.com/zeltjs/zelt/commit/35e5de8305998e90f1fa1a31268ac7508d26bfbd))
* correct website URL in package README files ([636eae3](https://github.com/zeltjs/zelt/commit/636eae3110aece0a1c020d1847dcc311d024a757))
* **openapi:** add cli to tsconfig references for type resolution ([4eca5a1](https://github.com/zeltjs/zelt/commit/4eca5a1b80cfec2f2e29d9aa6bb00616c9a54285))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))


### Dependencies

* The following workspace dependencies were updated
  * devDependencies
    * @zeltjs/cli bumped to 0.2.1
  * peerDependencies
    * @zeltjs/cli bumped to 0.2.1
    * @zeltjs/core bumped to 0.2.1

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
