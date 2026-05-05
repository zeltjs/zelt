# Changelog

## [0.1.1](https://github.com/zeltjs/zelt/compare/core-v0.1.0...core-v0.1.1) (2026-05-05)


### Bug Fixes

* **core:** add license section to README ([558abe2](https://github.com/zeltjs/zelt/commit/558abe26cb9bf2604faa22a5ef02ec77f553a6a6))
* **core:** add license section to README ([2eb1036](https://github.com/zeltjs/zelt/commit/2eb1036516bb9825b6c4ed403583f7b627a0658b))

## [0.1.0](https://github.com/zeltjs/zelt/compare/core-v0.0.1...core-v0.1.0) (2026-05-05)


### ⚠ BREAKING CHANGES

* **core:** Error response format changed from { error: '...' } to { code: '...' }

### Features

* **contract:** add Route/BuildAppType/Extract* type functions ([a9c966a](https://github.com/zeltjs/zelt/commit/a9c966acde598016906012e854d110a8dc822295))
* **core:** add @Config decorator ([60c593c](https://github.com/zeltjs/zelt/commit/60c593c4d9aa36059feaca06dcb02131837667ff))
* **core:** add @Controller class decorator ([94321af](https://github.com/zeltjs/zelt/commit/94321af71b39f7479677264e4e9846fde4f75e12))
* **core:** add AsyncLocalStorage entry context ([aca23e4](https://github.com/zeltjs/zelt/commit/aca23e4204b875932d39439e32edd56dad1bdef7))
* **core:** add config module index ([c4c5fc8](https://github.com/zeltjs/zelt/commit/c4c5fc897219e4b45f6b773618c5fe02c8d6153f))
* **core:** add ConfigClass type definition ([cbf148a](https://github.com/zeltjs/zelt/commit/cbf148a207d1529406afd9dd0eed86c46ae84f51))
* **core:** add configs option to createHttpApp ([10ace92](https://github.com/zeltjs/zelt/commit/10ace9279cd018550691bd6f73496bfe047fdee8))
* **core:** add configs support to createContainer ([24c4c30](https://github.com/zeltjs/zelt/commit/24c4c30287216705aed216fd646a20d564882956))
* **core:** add createApp + opaque Application (http stub) ([60f4cc6](https://github.com/zeltjs/zelt/commit/60f4cc6d3d40cc844d649d14785599b7076b7a7e))
* **core:** add global error handler (validation/runtime errors) ([d4f62da](https://github.com/zeltjs/zelt/commit/d4f62daf783d34d6f60258e02128d4c0186772e1))
* **core:** add HTTP method decorators (Get/Post/Put/Patch/Delete) ([3c60a72](https://github.com/zeltjs/zelt/commit/3c60a727882c362c9be36b7e2e8e23dd8b5d0a3d))
* **core:** add injectConfig helper ([010d0b9](https://github.com/zeltjs/zelt/commit/010d0b90912853ddd3fd57df6c0e8ec249b75913))
* **core:** add internal route-builder (joinPath/collectRoutes/buildRoutes) ([90ed362](https://github.com/zeltjs/zelt/commit/90ed36254bc75989a85939bb2d39fb1fe5190af6))
* **core:** add Logger class ([a4972c6](https://github.com/zeltjs/zelt/commit/a4972c6dd46a1faf7088f87e629010ac2529c880))
* **core:** add logger module index ([bbf394b](https://github.com/zeltjs/zelt/commit/bbf394bf75cdae479af1ec6081f462ac81ecca93))
* **core:** add LoggerConfig ([f80da49](https://github.com/zeltjs/zelt/commit/f80da4989d387fa8cdaec481a950f0b1de5a029c))
* **core:** add middleware support with type-safe context ([0811f51](https://github.com/zeltjs/zelt/commit/0811f51ef434d251fcb591332022665fe0cad195))
* **core:** add middleware support with type-safe context ([3a819b3](https://github.com/zeltjs/zelt/commit/3a819b3932b04cd5f42c164b970484849ff26944))
* **core:** add modules/logger export to package.json ([22d8326](https://github.com/zeltjs/zelt/commit/22d832674d39c376a0c6a36f5929dab709d23d44))
* **core:** add pathParam() primitive ([5ae6f01](https://github.com/zeltjs/zelt/commit/5ae6f0153da81e874a63a508b1c26fd5a87a42e8))
* **core:** add response() primitive with hono Context bypass ([bd83e66](https://github.com/zeltjs/zelt/commit/bd83e662b6e460fde6efea1e72a0b505e28fde49))
* **core:** add validated() primitive (valibot) ([6706235](https://github.com/zeltjs/zelt/commit/670623516c60a42f89033c5699d3a3ef59829801))
* **core:** add WeakMap-based decorator metadata storage ([acb668e](https://github.com/zeltjs/zelt/commit/acb668ef7891484de38c378488c94c68e20553aa))
* **core:** define ValidationErrorBody valibot schema and align error-handler ([99d9295](https://github.com/zeltjs/zelt/commit/99d92959878c51f8fb29f985a3cc88696157cd8d))
* **core:** export Config and injectConfig from index ([0e30581](https://github.com/zeltjs/zelt/commit/0e305819f8e9a8d587b063ed767c01c0b6a84683))
* **core:** export koyaErrorBodySchema and KoyaErrorBody from barrel ([3f9d6d8](https://github.com/zeltjs/zelt/commit/3f9d6d8af91e9cd4c33dba9a886e0d80853fd22d))
* **core:** export Phase 2 (1) public API barrel ([4bc2d8d](https://github.com/zeltjs/zelt/commit/4bc2d8dce95ff9fd30a040ca577c7716c54477ed))
* **core:** handle HTTPException with KoyaErrorBody and guard internal_error message by NODE_ENV ([96bbd5d](https://github.com/zeltjs/zelt/commit/96bbd5d2b9ee540d555f21cab35bf33af5e42f1a))
* **core:** implement app.http() runtime adapter + toWorker() ([53d7ded](https://github.com/zeltjs/zelt/commit/53d7ded3327da66f15f788d7df8256039d6ab156))
* **core:** introduce KoyaErrorBody discriminated union schema ([eaa0d12](https://github.com/zeltjs/zelt/commit/eaa0d12bec78163e0dd941917d4273a908112147))
* **core:** Phase 2 (3) error handling and KoyaErrorBody schema ([20c5967](https://github.com/zeltjs/zelt/commit/20c5967c43b64e83a88cc7d613d9df4e628b5017))
* **core:** re-export HTTPException from hono ([bdad944](https://github.com/zeltjs/zelt/commit/bdad9445e29c20bb010ddf1c1afa248295bf3829))
* **core:** re-export inject from @needle-di/core for constructor DI ([61834d0](https://github.com/zeltjs/zelt/commit/61834d06e3878147c9629ee6d9463077285460dd))
* **core:** replace HttpApp.toWorker with fetch and request ([40dc59f](https://github.com/zeltjs/zelt/commit/40dc59f8978d27549db36b15832437addafb2145))
* **examples:** rewrite hello example with Phase 2 API ([1fed0e4](https://github.com/zeltjs/zelt/commit/1fed0e43542120d9aca5ca023f9dbff77de8bb24))
* Phase 2 (2) API Contract (AppType + OpenAPI) ([7eaf389](https://github.com/zeltjs/zelt/commit/7eaf38994429a47a2ed29109c9ee1f08cbef5cbf))
* Phase 2 (4) testing utility — createTestContainer + HttpApp.fetch/request ([fa55f3a](https://github.com/zeltjs/zelt/commit/fa55f3add8a7f42493cc3f010b9de737076a9191))
* **testing:** add createTestApp + reverse phase 1 dogfood deviations ([63e46e7](https://github.com/zeltjs/zelt/commit/63e46e7d7b5091ff053763710176cadb24156017))


### Bug Fixes

* **core:** add override modifier to getter in test ([418c3ce](https://github.com/zeltjs/zelt/commit/418c3ce9b0837e6c31ff4de34898089600a9a235))
* **core:** hide @needle-di/core.Container from public d.ts ([9919b60](https://github.com/zeltjs/zelt/commit/9919b60c1f91f8ccc50ee8a0f33b8aaf00a24502))
* **core:** narrow response().redirect status to spec-defined codes ([b03f512](https://github.com/zeltjs/zelt/commit/b03f512871f259d8bdf96638a78868179bd992d1))
* **core:** use strict middleware types and whitelist in CI ([c75c89e](https://github.com/zeltjs/zelt/commit/c75c89e60460e66dd5b0c090b84603c340d6f010))
* resolve biome and typescript lint errors ([22f5a4b](https://github.com/zeltjs/zelt/commit/22f5a4b400e5c51d290395469e7403dde9cb1ec5))
* resolve biome and typescript lint errors ([905da59](https://github.com/zeltjs/zelt/commit/905da59a3edcb0fac5ca9ec3baeeb7a4bdfec5c5))
* resolve remaining lint errors for CI ([7adffb9](https://github.com/zeltjs/zelt/commit/7adffb9830bfb8280d1e0786b8874428b2b864f5))
* restore token !== configClass check and consolidate logger tests ([c0749cb](https://github.com/zeltjs/zelt/commit/c0749cbdfb4dac2ab9a82bc97743aa1b90cc8888))


### Code Refactoring

* **core:** migrate error handling to Hono pattern ([a99be8c](https://github.com/zeltjs/zelt/commit/a99be8c5633510b04e72c89e95b0af3b4608dba5))
