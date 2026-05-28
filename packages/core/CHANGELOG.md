# Changelog

## Unreleased

### ⚠ BREAKING CHANGES

* **di:** `inject(token, options)` is no longer part of the Zelt API. Code using
  needle-di options such as `{ optional: true }` through `inject()` should model
  the dependency explicitly instead of relying on optional injection.

## [0.5.0](https://github.com/zeltjs/zelt/compare/core-v0.4.0...core-v0.5.0) (2026-05-17)


### Bug Fixes

* **build:** transform TC39 decorators with SWC at build time ([c681663](https://github.com/zeltjs/zelt/commit/c6816636d04e85690115fd64c00aaf02a11fc70b))
* **build:** transform TC39 decorators with SWC at build time ([3430ff3](https://github.com/zeltjs/zelt/commit/3430ff33f0dc31981a7da55246c7ca43baa2d281))

## [0.4.0](https://github.com/zeltjs/zelt/compare/core-v0.3.0...core-v0.4.0) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** MiddlewareInstance.use() signature now includes options parameter
* **adapters:** onNode() and onCloudflareWorkers() now return Promise.
* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([d3b26a5](https://github.com/zeltjs/zelt/commit/d3b26a57c5eabb9c00033a04fdf2e8216fd6fd31))
* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([35e81b9](https://github.com/zeltjs/zelt/commit/35e81b9aeaeefc067793db101b641159a7becff9))
* **adapter-node:** add exec() for CLI command execution ([dd2249d](https://github.com/zeltjs/zelt/commit/dd2249d89be523c54b865a994c3a7b557656e225))
* **adapters:** make onNode and onCloudflareWorkers async with get() support ([16bea55](https://github.com/zeltjs/zelt/commit/16bea55319a1da9ccf9c14f118a51211547ef0b1))
* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* **auth:** add JWT driver option and session package ([1480da1](https://github.com/zeltjs/zelt/commit/1480da1cac6b0bb067b3a4d9ef8e97d9c6813620))
* **auth:** add JWT driver option and session package ([6d85c56](https://github.com/zeltjs/zelt/commit/6d85c566e790f2797fdd6e84e72c73388c1457de))
* **command:** register @Command classes as transient ([845c29d](https://github.com/zeltjs/zelt/commit/845c29d07442c7de0ff74f4f2630e0368f346df4))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add CliConfig for CLI environment abstraction ([d2a12ae](https://github.com/zeltjs/zelt/commit/d2a12aee63b99d3f4338c4541e4dd34ece54a5b5))
* **core:** add decorator context adapter layer ([e72c972](https://github.com/zeltjs/zelt/commit/e72c9724602a08b037db14e1c8d8271de2d63001))
* **core:** add getMetadata API to HttpApp ([2776d33](https://github.com/zeltjs/zelt/commit/2776d33340d4b5756e1cd9e0e6ce918754f76693))
* **core:** add getMetadata API to HttpApp for controller route information ([7a321ee](https://github.com/zeltjs/zelt/commit/7a321eea4522b2cbdf302ad2fe7df5a4d0523a3c))
* **core:** add Hono context primitives ([b4c9c37](https://github.com/zeltjs/zelt/commit/b4c9c372b0de945645919faeca176af52f25dd21))
* **core:** add Hono context primitives ([e801109](https://github.com/zeltjs/zelt/commit/e801109a3f82de30e3dc63cc9e7e1487287bbb50))
* **core:** add lazy controller resolution for serverless cold start optimization ([efb36d7](https://github.com/zeltjs/zelt/commit/efb36d701c8369f4e0b23b8fa2495b55245c793b))
* **core:** add lazy controller resolution for serverless cold start optimization ([e19bc6a](https://github.com/zeltjs/zelt/commit/e19bc6a3b8bce96f4bec913412e27f58fbfb650e))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add pending/resolve pattern to metadata stores ([4496ed0](https://github.com/zeltjs/zelt/commit/4496ed04af7f7ace12c54192ae98807839fa22b9))
* **core:** add pending/resolve pattern to scheduler metadata ([2244994](https://github.com/zeltjs/zelt/commit/2244994db7e5cb09fbd2332e2405d8f54ddb0dfc))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add stable runtime entrypoint for validation ([4021a3c](https://github.com/zeltjs/zelt/commit/4021a3c5d4bda4bd6fc8ceae6ea5825f6d26693d))
* **core:** add streaming support to ResponseBuilder ([cf8b819](https://github.com/zeltjs/zelt/commit/cf8b8190f651a8ab2c01ec2a937fea4c4e03b400))
* **core:** add streaming support to ResponseBuilder ([08141fb](https://github.com/zeltjs/zelt/commit/08141fb365ede7bc33ecb4bd93b619066bef9ee3))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add structured error classes with Zelt prefix ([b6e5daa](https://github.com/zeltjs/zelt/commit/b6e5daa62f964bcdb7a67ef23238f39ab4514fea))
* **core:** add structured error classes with Zelt prefix ([0bfe9c5](https://github.com/zeltjs/zelt/commit/0bfe9c52e240f4768aa1bee52f1cfba5dd48d027))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** auto-start scheduler via lifecycle ([b18fe06](https://github.com/zeltjs/zelt/commit/b18fe060b46de9cc64cc51c85c1f6d590e4d91e6))
* **core:** export findConfigToken for config token lookup ([695a942](https://github.com/zeltjs/zelt/commit/695a94228d69580f887825784c100e2fbfc5c033))
* **core:** export Lifecycle type ([02fbab4](https://github.com/zeltjs/zelt/commit/02fbab441aa967932b66f9d12444cc23e81edfae))
* **core:** extract validated types to dedicated file ([022cfef](https://github.com/zeltjs/zelt/commit/022cfeffb635bce77dba0a1de2f73a89249de0e2))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* **core:** make createTestTarget async with lifecycle management ([b42d455](https://github.com/zeltjs/zelt/commit/b42d455abae086036be0480db98eaab72b34c2b9))
* **core:** update Authorized decorator to use adapter layer ([bececdd](https://github.com/zeltjs/zelt/commit/bececdd707eba4fe72397b77d4ef335fc679f830))
* **core:** update class decorators (ErrorHandler, Config) to use adapter layer ([2687e75](https://github.com/zeltjs/zelt/commit/2687e75a39fbdc491f221161439d1dd212fd4696))
* **core:** update Controller decorator to use adapter layer and resolve pending metadata ([44579aa](https://github.com/zeltjs/zelt/commit/44579aabf6d7cce4c4804cbffd058e4e11a06b83))
* **core:** update HTTP method decorators to use adapter layer ([a38776f](https://github.com/zeltjs/zelt/commit/a38776f2d119c9a9dcd5c5957fc272ba4f2d4365))
* **core:** update middleware decorators to use adapter layer ([14f4356](https://github.com/zeltjs/zelt/commit/14f4356ac7873b327df88acfb72eac8f056f3b2d))
* **core:** update schedule method decorators to use adapter layer ([7e1eda3](https://github.com/zeltjs/zelt/commit/7e1eda37890876f286fc676c45daa77ec1daa335))
* **core:** update Scheduled decorator to use adapter layer ([24dc3f0](https://github.com/zeltjs/zelt/commit/24dc3f0ea3276d762e0bfb89e11def60e7bb7488))
* **di:** add getTransient for per-call instance creation ([6f3e5ba](https://github.com/zeltjs/zelt/commit/6f3e5bad0cecd1ad73f0f058cf6046ae29a34649))
* **di:** add resolve as SSOT for class resolution ([03cabfe](https://github.com/zeltjs/zelt/commit/03cabfed9861e0558b601d6c4a18512dac60f4f2))
* **di:** add transient pattern for per-call instance creation ([cd7f3a8](https://github.com/zeltjs/zelt/commit/cd7f3a8f0d561de4e7bf2568e06f57839ef0d09c))
* **di:** add transient registration and check ([a2554d2](https://github.com/zeltjs/zelt/commit/a2554d2eba473e4474bd43ff2cd782b0297bbf53))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **logger:** add LogEntry, LogContext types with safe stringify ([7335061](https://github.com/zeltjs/zelt/commit/7335061b95af93400b7eed977b7628c46986d852))
* **logger:** add LoggerFormatter interface ([bac3b91](https://github.com/zeltjs/zelt/commit/bac3b9145ba291223fa852658498083bd1412233))
* **logger:** add LoggerTransport interface (sync only) ([8417478](https://github.com/zeltjs/zelt/commit/84174786786e1e32c5dee7d20ea9a6ba2bf612bc))
* **logger:** add structured logging with Formatter/Transport architecture ([20a11e4](https://github.com/zeltjs/zelt/commit/20a11e48effb82b49832ff03773228c2c216ec90))
* **logger:** add withLogContext using AsyncLocalStorage ([390f10c](https://github.com/zeltjs/zelt/commit/390f10c15d8bf781a3d6f7eb914c05889131cddf))
* **logger:** export all logger types and utilities ([039d3ec](https://github.com/zeltjs/zelt/commit/039d3ec783e75a2161711ccc0a704cc79a75a381))
* **logger:** implement ConsoleTransport ([8c9a92a](https://github.com/zeltjs/zelt/commit/8c9a92aca847dea0baf650272189e8e060e873d7))
* **logger:** implement JsonlFormatter with safe stringify ([27e1caf](https://github.com/zeltjs/zelt/commit/27e1caf11372db500ec04854fad457b841aef7ba))
* **logger:** implement PrettyFormatter with TTY-aware colors ([f851388](https://github.com/zeltjs/zelt/commit/f851388aabff2cabf97f120d021a6bd2bb26afea))
* **logger:** refactor Logger with structured logging and child support ([2ca2e2a](https://github.com/zeltjs/zelt/commit/2ca2e2a7af1641de4fc47360729e7954a962320f))
* **logger:** update LoggerConfig with TransportBinding (no circular dep) ([b9f74d4](https://github.com/zeltjs/zelt/commit/b9f74d43b7c9e096e446d47c5c6d602f4413d521))
* **scheduler:** require explicit startScheduler() call ([de6113a](https://github.com/zeltjs/zelt/commit/de6113ac457a0df5c84872ddf197013afdc84605))
* **scheduler:** require explicit startScheduler() call ([39aa6fa](https://github.com/zeltjs/zelt/commit/39aa6fa4d98174b898beffacf0c1ed9b3cb98af0))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* address code review feedback ([a43cca5](https://github.com/zeltjs/zelt/commit/a43cca54c7eeb3d1d1edcef0953416fa4f0407a1))
* **ci:** exclude [@internal](https://github.com/internal) exports from knip production check ([dfc8d09](https://github.com/zeltjs/zelt/commit/dfc8d09f7126e5fbe37f8796bf6f6102dc9d4bd2))
* correct website URL in package README files ([35e5de8](https://github.com/zeltjs/zelt/commit/35e5de8305998e90f1fa1a31268ac7508d26bfbd))
* correct website URL in package README files ([636eae3](https://github.com/zeltjs/zelt/commit/636eae3110aece0a1c020d1847dcc311d024a757))
* define CookieOptions type to avoid hono leak ([c9d91e5](https://github.com/zeltjs/zelt/commit/c9d91e5ecf9a4937ebd8c9020e88333185ca5c59))
* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **hono-client:** add testing package reference to tsconfig ([860405d](https://github.com/zeltjs/zelt/commit/860405d3a6088e7bb6f1c3c49ad1540fec4c112e))
* **lint:** resolve lint errors after main merge ([90766c3](https://github.com/zeltjs/zelt/commit/90766c36072fbb5b22de15162ff7991131c7dc67))
* remove import rename to comply with lint rules ([4c791af](https://github.com/zeltjs/zelt/commit/4c791af265fcae3f6d38440d7d4c2d6450477132))
* remove unused exports flagged by knip ([89efc31](https://github.com/zeltjs/zelt/commit/89efc31cf31e7f8d41a6436af40932a5ddecabe1))
* resolve lint errors in primitives ([c4f2c08](https://github.com/zeltjs/zelt/commit/c4f2c0889340a238509415342fc3109621078c1d))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))
* update primitives tests to use 2-phase initialization API ([f4e3d94](https://github.com/zeltjs/zelt/commit/f4e3d94f3298b743f0ee3e891b9ee48437cdfbe9))
* use onNode adapter in examples and fix max-lines-per-function ([0bbc63f](https://github.com/zeltjs/zelt/commit/0bbc63f7fa1eb0e3776371d33d3017a88d74946c))
* use ts-pattern for body() type mapping ([73b2ba3](https://github.com/zeltjs/zelt/commit/73b2ba312e202fb1ec297e5f1f74e499ca5439e2))

## [0.3.0](https://github.com/zeltjs/zelt/compare/core-v0.2.1...core-v0.3.0) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** MiddlewareInstance.use() signature now includes options parameter
* **adapters:** onNode() and onCloudflareWorkers() now return Promise.
* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([d3b26a5](https://github.com/zeltjs/zelt/commit/d3b26a57c5eabb9c00033a04fdf2e8216fd6fd31))
* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([35e81b9](https://github.com/zeltjs/zelt/commit/35e81b9aeaeefc067793db101b641159a7becff9))
* **adapter-node:** add exec() for CLI command execution ([dd2249d](https://github.com/zeltjs/zelt/commit/dd2249d89be523c54b865a994c3a7b557656e225))
* **adapters:** make onNode and onCloudflareWorkers async with get() support ([16bea55](https://github.com/zeltjs/zelt/commit/16bea55319a1da9ccf9c14f118a51211547ef0b1))
* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* **auth:** add JWT driver option and session package ([1480da1](https://github.com/zeltjs/zelt/commit/1480da1cac6b0bb067b3a4d9ef8e97d9c6813620))
* **auth:** add JWT driver option and session package ([6d85c56](https://github.com/zeltjs/zelt/commit/6d85c566e790f2797fdd6e84e72c73388c1457de))
* **command:** register @Command classes as transient ([845c29d](https://github.com/zeltjs/zelt/commit/845c29d07442c7de0ff74f4f2630e0368f346df4))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add CliConfig for CLI environment abstraction ([d2a12ae](https://github.com/zeltjs/zelt/commit/d2a12aee63b99d3f4338c4541e4dd34ece54a5b5))
* **core:** add decorator context adapter layer ([e72c972](https://github.com/zeltjs/zelt/commit/e72c9724602a08b037db14e1c8d8271de2d63001))
* **core:** add getMetadata API to HttpApp ([2776d33](https://github.com/zeltjs/zelt/commit/2776d33340d4b5756e1cd9e0e6ce918754f76693))
* **core:** add getMetadata API to HttpApp for controller route information ([7a321ee](https://github.com/zeltjs/zelt/commit/7a321eea4522b2cbdf302ad2fe7df5a4d0523a3c))
* **core:** add Hono context primitives ([b4c9c37](https://github.com/zeltjs/zelt/commit/b4c9c372b0de945645919faeca176af52f25dd21))
* **core:** add Hono context primitives ([e801109](https://github.com/zeltjs/zelt/commit/e801109a3f82de30e3dc63cc9e7e1487287bbb50))
* **core:** add lazy controller resolution for serverless cold start optimization ([efb36d7](https://github.com/zeltjs/zelt/commit/efb36d701c8369f4e0b23b8fa2495b55245c793b))
* **core:** add lazy controller resolution for serverless cold start optimization ([e19bc6a](https://github.com/zeltjs/zelt/commit/e19bc6a3b8bce96f4bec913412e27f58fbfb650e))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add pending/resolve pattern to metadata stores ([4496ed0](https://github.com/zeltjs/zelt/commit/4496ed04af7f7ace12c54192ae98807839fa22b9))
* **core:** add pending/resolve pattern to scheduler metadata ([2244994](https://github.com/zeltjs/zelt/commit/2244994db7e5cb09fbd2332e2405d8f54ddb0dfc))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add stable runtime entrypoint for validation ([4021a3c](https://github.com/zeltjs/zelt/commit/4021a3c5d4bda4bd6fc8ceae6ea5825f6d26693d))
* **core:** add streaming support to ResponseBuilder ([cf8b819](https://github.com/zeltjs/zelt/commit/cf8b8190f651a8ab2c01ec2a937fea4c4e03b400))
* **core:** add streaming support to ResponseBuilder ([08141fb](https://github.com/zeltjs/zelt/commit/08141fb365ede7bc33ecb4bd93b619066bef9ee3))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add structured error classes with Zelt prefix ([b6e5daa](https://github.com/zeltjs/zelt/commit/b6e5daa62f964bcdb7a67ef23238f39ab4514fea))
* **core:** add structured error classes with Zelt prefix ([0bfe9c5](https://github.com/zeltjs/zelt/commit/0bfe9c52e240f4768aa1bee52f1cfba5dd48d027))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** auto-start scheduler via lifecycle ([b18fe06](https://github.com/zeltjs/zelt/commit/b18fe060b46de9cc64cc51c85c1f6d590e4d91e6))
* **core:** export findConfigToken for config token lookup ([695a942](https://github.com/zeltjs/zelt/commit/695a94228d69580f887825784c100e2fbfc5c033))
* **core:** export Lifecycle type ([02fbab4](https://github.com/zeltjs/zelt/commit/02fbab441aa967932b66f9d12444cc23e81edfae))
* **core:** extract validated types to dedicated file ([022cfef](https://github.com/zeltjs/zelt/commit/022cfeffb635bce77dba0a1de2f73a89249de0e2))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* **core:** make createTestTarget async with lifecycle management ([b42d455](https://github.com/zeltjs/zelt/commit/b42d455abae086036be0480db98eaab72b34c2b9))
* **core:** update Authorized decorator to use adapter layer ([bececdd](https://github.com/zeltjs/zelt/commit/bececdd707eba4fe72397b77d4ef335fc679f830))
* **core:** update class decorators (ErrorHandler, Config) to use adapter layer ([2687e75](https://github.com/zeltjs/zelt/commit/2687e75a39fbdc491f221161439d1dd212fd4696))
* **core:** update Controller decorator to use adapter layer and resolve pending metadata ([44579aa](https://github.com/zeltjs/zelt/commit/44579aabf6d7cce4c4804cbffd058e4e11a06b83))
* **core:** update HTTP method decorators to use adapter layer ([a38776f](https://github.com/zeltjs/zelt/commit/a38776f2d119c9a9dcd5c5957fc272ba4f2d4365))
* **core:** update middleware decorators to use adapter layer ([14f4356](https://github.com/zeltjs/zelt/commit/14f4356ac7873b327df88acfb72eac8f056f3b2d))
* **core:** update schedule method decorators to use adapter layer ([7e1eda3](https://github.com/zeltjs/zelt/commit/7e1eda37890876f286fc676c45daa77ec1daa335))
* **core:** update Scheduled decorator to use adapter layer ([24dc3f0](https://github.com/zeltjs/zelt/commit/24dc3f0ea3276d762e0bfb89e11def60e7bb7488))
* **di:** add getTransient for per-call instance creation ([6f3e5ba](https://github.com/zeltjs/zelt/commit/6f3e5bad0cecd1ad73f0f058cf6046ae29a34649))
* **di:** add resolve as SSOT for class resolution ([03cabfe](https://github.com/zeltjs/zelt/commit/03cabfed9861e0558b601d6c4a18512dac60f4f2))
* **di:** add transient pattern for per-call instance creation ([cd7f3a8](https://github.com/zeltjs/zelt/commit/cd7f3a8f0d561de4e7bf2568e06f57839ef0d09c))
* **di:** add transient registration and check ([a2554d2](https://github.com/zeltjs/zelt/commit/a2554d2eba473e4474bd43ff2cd782b0297bbf53))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **logger:** add LogEntry, LogContext types with safe stringify ([7335061](https://github.com/zeltjs/zelt/commit/7335061b95af93400b7eed977b7628c46986d852))
* **logger:** add LoggerFormatter interface ([bac3b91](https://github.com/zeltjs/zelt/commit/bac3b9145ba291223fa852658498083bd1412233))
* **logger:** add LoggerTransport interface (sync only) ([8417478](https://github.com/zeltjs/zelt/commit/84174786786e1e32c5dee7d20ea9a6ba2bf612bc))
* **logger:** add structured logging with Formatter/Transport architecture ([20a11e4](https://github.com/zeltjs/zelt/commit/20a11e48effb82b49832ff03773228c2c216ec90))
* **logger:** add withLogContext using AsyncLocalStorage ([390f10c](https://github.com/zeltjs/zelt/commit/390f10c15d8bf781a3d6f7eb914c05889131cddf))
* **logger:** export all logger types and utilities ([039d3ec](https://github.com/zeltjs/zelt/commit/039d3ec783e75a2161711ccc0a704cc79a75a381))
* **logger:** implement ConsoleTransport ([8c9a92a](https://github.com/zeltjs/zelt/commit/8c9a92aca847dea0baf650272189e8e060e873d7))
* **logger:** implement JsonlFormatter with safe stringify ([27e1caf](https://github.com/zeltjs/zelt/commit/27e1caf11372db500ec04854fad457b841aef7ba))
* **logger:** implement PrettyFormatter with TTY-aware colors ([f851388](https://github.com/zeltjs/zelt/commit/f851388aabff2cabf97f120d021a6bd2bb26afea))
* **logger:** refactor Logger with structured logging and child support ([2ca2e2a](https://github.com/zeltjs/zelt/commit/2ca2e2a7af1641de4fc47360729e7954a962320f))
* **logger:** update LoggerConfig with TransportBinding (no circular dep) ([b9f74d4](https://github.com/zeltjs/zelt/commit/b9f74d43b7c9e096e446d47c5c6d602f4413d521))
* **scheduler:** require explicit startScheduler() call ([de6113a](https://github.com/zeltjs/zelt/commit/de6113ac457a0df5c84872ddf197013afdc84605))
* **scheduler:** require explicit startScheduler() call ([39aa6fa](https://github.com/zeltjs/zelt/commit/39aa6fa4d98174b898beffacf0c1ed9b3cb98af0))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* address code review feedback ([a43cca5](https://github.com/zeltjs/zelt/commit/a43cca54c7eeb3d1d1edcef0953416fa4f0407a1))
* **ci:** exclude [@internal](https://github.com/internal) exports from knip production check ([dfc8d09](https://github.com/zeltjs/zelt/commit/dfc8d09f7126e5fbe37f8796bf6f6102dc9d4bd2))
* correct website URL in package README files ([35e5de8](https://github.com/zeltjs/zelt/commit/35e5de8305998e90f1fa1a31268ac7508d26bfbd))
* correct website URL in package README files ([636eae3](https://github.com/zeltjs/zelt/commit/636eae3110aece0a1c020d1847dcc311d024a757))
* define CookieOptions type to avoid hono leak ([c9d91e5](https://github.com/zeltjs/zelt/commit/c9d91e5ecf9a4937ebd8c9020e88333185ca5c59))
* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **hono-client:** add testing package reference to tsconfig ([860405d](https://github.com/zeltjs/zelt/commit/860405d3a6088e7bb6f1c3c49ad1540fec4c112e))
* **lint:** resolve lint errors after main merge ([90766c3](https://github.com/zeltjs/zelt/commit/90766c36072fbb5b22de15162ff7991131c7dc67))
* remove import rename to comply with lint rules ([4c791af](https://github.com/zeltjs/zelt/commit/4c791af265fcae3f6d38440d7d4c2d6450477132))
* remove unused exports flagged by knip ([89efc31](https://github.com/zeltjs/zelt/commit/89efc31cf31e7f8d41a6436af40932a5ddecabe1))
* resolve lint errors in primitives ([c4f2c08](https://github.com/zeltjs/zelt/commit/c4f2c0889340a238509415342fc3109621078c1d))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))
* update primitives tests to use 2-phase initialization API ([f4e3d94](https://github.com/zeltjs/zelt/commit/f4e3d94f3298b743f0ee3e891b9ee48437cdfbe9))
* use onNode adapter in examples and fix max-lines-per-function ([0bbc63f](https://github.com/zeltjs/zelt/commit/0bbc63f7fa1eb0e3776371d33d3017a88d74946c))
* use ts-pattern for body() type mapping ([73b2ba3](https://github.com/zeltjs/zelt/commit/73b2ba312e202fb1ec297e5f1f74e499ca5439e2))

## [0.2.1](https://github.com/zeltjs/zelt/compare/core-v0.1.1...core-v0.2.1) (2026-05-17)


### ⚠ BREAKING CHANGES

* **core:** MiddlewareInstance.use() signature now includes options parameter
* **adapters:** onNode() and onCloudflareWorkers() now return Promise.
* **core:** make createHttpApp sync with 2-phase initialization
* **core:** createHttpApp now returns Promise<HttpApp>
    - Calls lifecycle.startup() before returning
    - All tests updated to await createHttpApp()
    - Examples updated to use top-level await

### Features

* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([d3b26a5](https://github.com/zeltjs/zelt/commit/d3b26a57c5eabb9c00033a04fdf2e8216fd6fd31))
* **adapter-cloudflare-workers:** add dynamic option with __dynamicMeta ([35e81b9](https://github.com/zeltjs/zelt/commit/35e81b9aeaeefc067793db101b641159a7becff9))
* **adapter-node:** add exec() for CLI command execution ([dd2249d](https://github.com/zeltjs/zelt/commit/dd2249d89be523c54b865a994c3a7b557656e225))
* **adapters:** make onNode and onCloudflareWorkers async with get() support ([16bea55](https://github.com/zeltjs/zelt/commit/16bea55319a1da9ccf9c14f118a51211547ef0b1))
* add @zeltjs/kv, @zeltjs/kv-driver-redis, @zeltjs/rate-limit packages ([f6830e2](https://github.com/zeltjs/zelt/commit/f6830e23687e042ed450336a967a9bca0f1c5b09))
* **auth:** add JWT driver option and session package ([1480da1](https://github.com/zeltjs/zelt/commit/1480da1cac6b0bb067b3a4d9ef8e97d9c6813620))
* **auth:** add JWT driver option and session package ([6d85c56](https://github.com/zeltjs/zelt/commit/6d85c566e790f2797fdd6e84e72c73388c1457de))
* **command:** register @Command classes as transient ([845c29d](https://github.com/zeltjs/zelt/commit/845c29d07442c7de0ff74f4f2630e0368f346df4))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add CliConfig for CLI environment abstraction ([d2a12ae](https://github.com/zeltjs/zelt/commit/d2a12aee63b99d3f4338c4541e4dd34ece54a5b5))
* **core:** add decorator context adapter layer ([e72c972](https://github.com/zeltjs/zelt/commit/e72c9724602a08b037db14e1c8d8271de2d63001))
* **core:** add getMetadata API to HttpApp ([2776d33](https://github.com/zeltjs/zelt/commit/2776d33340d4b5756e1cd9e0e6ce918754f76693))
* **core:** add getMetadata API to HttpApp for controller route information ([7a321ee](https://github.com/zeltjs/zelt/commit/7a321eea4522b2cbdf302ad2fe7df5a4d0523a3c))
* **core:** add Hono context primitives ([b4c9c37](https://github.com/zeltjs/zelt/commit/b4c9c372b0de945645919faeca176af52f25dd21))
* **core:** add Hono context primitives ([e801109](https://github.com/zeltjs/zelt/commit/e801109a3f82de30e3dc63cc9e7e1487287bbb50))
* **core:** add lazy controller resolution for serverless cold start optimization ([efb36d7](https://github.com/zeltjs/zelt/commit/efb36d701c8369f4e0b23b8fa2495b55245c793b))
* **core:** add lazy controller resolution for serverless cold start optimization ([e19bc6a](https://github.com/zeltjs/zelt/commit/e19bc6a3b8bce96f4bec913412e27f58fbfb650e))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add pending/resolve pattern to metadata stores ([4496ed0](https://github.com/zeltjs/zelt/commit/4496ed04af7f7ace12c54192ae98807839fa22b9))
* **core:** add pending/resolve pattern to scheduler metadata ([2244994](https://github.com/zeltjs/zelt/commit/2244994db7e5cb09fbd2332e2405d8f54ddb0dfc))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add stable runtime entrypoint for validation ([4021a3c](https://github.com/zeltjs/zelt/commit/4021a3c5d4bda4bd6fc8ceae6ea5825f6d26693d))
* **core:** add streaming support to ResponseBuilder ([cf8b819](https://github.com/zeltjs/zelt/commit/cf8b8190f651a8ab2c01ec2a937fea4c4e03b400))
* **core:** add streaming support to ResponseBuilder ([08141fb](https://github.com/zeltjs/zelt/commit/08141fb365ede7bc33ecb4bd93b619066bef9ee3))
* **core:** add structured error classes with Zelt prefix ([24e0a75](https://github.com/zeltjs/zelt/commit/24e0a7523e82d353dcb38f8a37d421bd44faccb9))
* **core:** add structured error classes with Zelt prefix ([955da70](https://github.com/zeltjs/zelt/commit/955da702cb843e7ae977982cf6c541a8dcddd11c))
* **core:** add structured error classes with Zelt prefix ([b6e5daa](https://github.com/zeltjs/zelt/commit/b6e5daa62f964bcdb7a67ef23238f39ab4514fea))
* **core:** add structured error classes with Zelt prefix ([0bfe9c5](https://github.com/zeltjs/zelt/commit/0bfe9c52e240f4768aa1bee52f1cfba5dd48d027))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** auto-start scheduler via lifecycle ([b18fe06](https://github.com/zeltjs/zelt/commit/b18fe060b46de9cc64cc51c85c1f6d590e4d91e6))
* **core:** export findConfigToken for config token lookup ([695a942](https://github.com/zeltjs/zelt/commit/695a94228d69580f887825784c100e2fbfc5c033))
* **core:** export Lifecycle type ([02fbab4](https://github.com/zeltjs/zelt/commit/02fbab441aa967932b66f9d12444cc23e81edfae))
* **core:** extract validated types to dedicated file ([022cfef](https://github.com/zeltjs/zelt/commit/022cfeffb635bce77dba0a1de2f73a89249de0e2))
* **core:** make createHttpApp async with lifecycle startup ([ac1d642](https://github.com/zeltjs/zelt/commit/ac1d64230b260379b7132e0632f9566b5c5bb3dc))
* **core:** make createHttpApp sync with 2-phase initialization ([29f9bd8](https://github.com/zeltjs/zelt/commit/29f9bd8fd853c58a834869e7cd9b34b587847321))
* **core:** make createTestTarget async with lifecycle management ([b42d455](https://github.com/zeltjs/zelt/commit/b42d455abae086036be0480db98eaab72b34c2b9))
* **core:** update Authorized decorator to use adapter layer ([bececdd](https://github.com/zeltjs/zelt/commit/bececdd707eba4fe72397b77d4ef335fc679f830))
* **core:** update class decorators (ErrorHandler, Config) to use adapter layer ([2687e75](https://github.com/zeltjs/zelt/commit/2687e75a39fbdc491f221161439d1dd212fd4696))
* **core:** update Controller decorator to use adapter layer and resolve pending metadata ([44579aa](https://github.com/zeltjs/zelt/commit/44579aabf6d7cce4c4804cbffd058e4e11a06b83))
* **core:** update HTTP method decorators to use adapter layer ([a38776f](https://github.com/zeltjs/zelt/commit/a38776f2d119c9a9dcd5c5957fc272ba4f2d4365))
* **core:** update middleware decorators to use adapter layer ([14f4356](https://github.com/zeltjs/zelt/commit/14f4356ac7873b327df88acfb72eac8f056f3b2d))
* **core:** update schedule method decorators to use adapter layer ([7e1eda3](https://github.com/zeltjs/zelt/commit/7e1eda37890876f286fc676c45daa77ec1daa335))
* **core:** update Scheduled decorator to use adapter layer ([24dc3f0](https://github.com/zeltjs/zelt/commit/24dc3f0ea3276d762e0bfb89e11def60e7bb7488))
* **di:** add getTransient for per-call instance creation ([6f3e5ba](https://github.com/zeltjs/zelt/commit/6f3e5bad0cecd1ad73f0f058cf6046ae29a34649))
* **di:** add resolve as SSOT for class resolution ([03cabfe](https://github.com/zeltjs/zelt/commit/03cabfed9861e0558b601d6c4a18512dac60f4f2))
* **di:** add transient pattern for per-call instance creation ([cd7f3a8](https://github.com/zeltjs/zelt/commit/cd7f3a8f0d561de4e7bf2568e06f57839ef0d09c))
* **di:** add transient registration and check ([a2554d2](https://github.com/zeltjs/zelt/commit/a2554d2eba473e4474bd43ff2cd782b0297bbf53))
* extract valibot validation to @zeltjs/validate-valibot package ([3e1b423](https://github.com/zeltjs/zelt/commit/3e1b42328147b6789b4c7bf59d972b2ee7f20100))
* **logger:** add LogEntry, LogContext types with safe stringify ([7335061](https://github.com/zeltjs/zelt/commit/7335061b95af93400b7eed977b7628c46986d852))
* **logger:** add LoggerFormatter interface ([bac3b91](https://github.com/zeltjs/zelt/commit/bac3b9145ba291223fa852658498083bd1412233))
* **logger:** add LoggerTransport interface (sync only) ([8417478](https://github.com/zeltjs/zelt/commit/84174786786e1e32c5dee7d20ea9a6ba2bf612bc))
* **logger:** add structured logging with Formatter/Transport architecture ([20a11e4](https://github.com/zeltjs/zelt/commit/20a11e48effb82b49832ff03773228c2c216ec90))
* **logger:** add withLogContext using AsyncLocalStorage ([390f10c](https://github.com/zeltjs/zelt/commit/390f10c15d8bf781a3d6f7eb914c05889131cddf))
* **logger:** export all logger types and utilities ([039d3ec](https://github.com/zeltjs/zelt/commit/039d3ec783e75a2161711ccc0a704cc79a75a381))
* **logger:** implement ConsoleTransport ([8c9a92a](https://github.com/zeltjs/zelt/commit/8c9a92aca847dea0baf650272189e8e060e873d7))
* **logger:** implement JsonlFormatter with safe stringify ([27e1caf](https://github.com/zeltjs/zelt/commit/27e1caf11372db500ec04854fad457b841aef7ba))
* **logger:** implement PrettyFormatter with TTY-aware colors ([f851388](https://github.com/zeltjs/zelt/commit/f851388aabff2cabf97f120d021a6bd2bb26afea))
* **logger:** refactor Logger with structured logging and child support ([2ca2e2a](https://github.com/zeltjs/zelt/commit/2ca2e2a7af1641de4fc47360729e7954a962320f))
* **logger:** update LoggerConfig with TransportBinding (no circular dep) ([b9f74d4](https://github.com/zeltjs/zelt/commit/b9f74d43b7c9e096e446d47c5c6d602f4413d521))
* **scheduler:** require explicit startScheduler() call ([de6113a](https://github.com/zeltjs/zelt/commit/de6113ac457a0df5c84872ddf197013afdc84605))
* **scheduler:** require explicit startScheduler() call ([39aa6fa](https://github.com/zeltjs/zelt/commit/39aa6fa4d98174b898beffacf0c1ed9b3cb98af0))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* address code review feedback ([a43cca5](https://github.com/zeltjs/zelt/commit/a43cca54c7eeb3d1d1edcef0953416fa4f0407a1))
* **ci:** exclude [@internal](https://github.com/internal) exports from knip production check ([dfc8d09](https://github.com/zeltjs/zelt/commit/dfc8d09f7126e5fbe37f8796bf6f6102dc9d4bd2))
* correct website URL in package README files ([35e5de8](https://github.com/zeltjs/zelt/commit/35e5de8305998e90f1fa1a31268ac7508d26bfbd))
* correct website URL in package README files ([636eae3](https://github.com/zeltjs/zelt/commit/636eae3110aece0a1c020d1847dcc311d024a757))
* define CookieOptions type to avoid hono leak ([c9d91e5](https://github.com/zeltjs/zelt/commit/c9d91e5ecf9a4937ebd8c9020e88333185ca5c59))
* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **hono-client:** add testing package reference to tsconfig ([860405d](https://github.com/zeltjs/zelt/commit/860405d3a6088e7bb6f1c3c49ad1540fec4c112e))
* **lint:** resolve lint errors after main merge ([90766c3](https://github.com/zeltjs/zelt/commit/90766c36072fbb5b22de15162ff7991131c7dc67))
* remove import rename to comply with lint rules ([4c791af](https://github.com/zeltjs/zelt/commit/4c791af265fcae3f6d38440d7d4c2d6450477132))
* remove unused exports flagged by knip ([89efc31](https://github.com/zeltjs/zelt/commit/89efc31cf31e7f8d41a6436af40932a5ddecabe1))
* resolve lint errors in primitives ([c4f2c08](https://github.com/zeltjs/zelt/commit/c4f2c0889340a238509415342fc3109621078c1d))
* **scripts:** correct npm trust command flag and improve interactive flow ([1d979e3](https://github.com/zeltjs/zelt/commit/1d979e3df81b77230dfa55819876b64019c49683))
* **scripts:** correct npm trust setup and add interactive flow ([ec493a6](https://github.com/zeltjs/zelt/commit/ec493a642972c55e93eb7d3ec34fa3024047484a))
* update primitives tests to use 2-phase initialization API ([f4e3d94](https://github.com/zeltjs/zelt/commit/f4e3d94f3298b743f0ee3e891b9ee48437cdfbe9))
* use onNode adapter in examples and fix max-lines-per-function ([0bbc63f](https://github.com/zeltjs/zelt/commit/0bbc63f7fa1eb0e3776371d33d3017a88d74946c))
* use ts-pattern for body() type mapping ([73b2ba3](https://github.com/zeltjs/zelt/commit/73b2ba312e202fb1ec297e5f1f74e499ca5439e2))

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
