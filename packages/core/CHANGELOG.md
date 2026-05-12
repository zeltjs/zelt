# Changelog

## [0.2.0](https://github.com/zeltjs/zelt/compare/core-v0.1.1...core-v0.2.0) (2026-05-12)


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
* add Scheduler and Command features ([e33df83](https://github.com/zeltjs/zelt/commit/e33df837fdc20d11fb485fc405b15246d80acc45))
* **auth:** add JWT driver option and session package ([1480da1](https://github.com/zeltjs/zelt/commit/1480da1cac6b0bb067b3a4d9ef8e97d9c6813620))
* **auth:** add JWT driver option and session package ([6d85c56](https://github.com/zeltjs/zelt/commit/6d85c566e790f2797fdd6e84e72c73388c1457de))
* **cli:** add zelt run command ([b121e8a](https://github.com/zeltjs/zelt/commit/b121e8afd683c95569949400385e2005237309f3))
* **core:** add @Cron decorator ([3782ac8](https://github.com/zeltjs/zelt/commit/3782ac8a603303769c0f9d41815652b09fbb54c9))
* **core:** add @Daily decorator ([e0fae2d](https://github.com/zeltjs/zelt/commit/e0fae2d3cd6c5e02e2c8ab6df0adb18b2f5a35fd))
* **core:** add @ErrorHandler decorator and errorHandlers option ([6094961](https://github.com/zeltjs/zelt/commit/6094961f422bd7be62c0fe5057bd7c163efaf310))
* **core:** add @ErrorHandler decorator and errorHandlers option ([1865993](https://github.com/zeltjs/zelt/commit/186599383d36a79a8bcc1d7c0df9da212acffee4))
* **core:** add @Every decorator ([2f6dfe3](https://github.com/zeltjs/zelt/commit/2f6dfe3d2f32e9a6c40994fdd873230cefe56c0a))
* **core:** add @Hourly decorator ([9a58fa1](https://github.com/zeltjs/zelt/commit/9a58fa14b1ad0aa4cf8e0114461466a5a83c7300))
* **core:** add @Scheduled decorator ([db27f11](https://github.com/zeltjs/zelt/commit/db27f11629c5d86a3d1ab4f420e317a2f0914570))
* **core:** add @Weekly decorator ([d1423fa](https://github.com/zeltjs/zelt/commit/d1423fa29cf8518aa1e748dff1ebb3b0ab52c177))
* **core:** add authentication and authorization primitives ([f7a61a2](https://github.com/zeltjs/zelt/commit/f7a61a2343ab091e10e7533e5bfdbd9539718d4b))
* **core:** add authentication and authorization primitives ([f48c026](https://github.com/zeltjs/zelt/commit/f48c026d54ab96cead32d97e959d6fa70488185b))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add CliConfig for CLI environment abstraction ([d2a12ae](https://github.com/zeltjs/zelt/commit/d2a12aee63b99d3f4338c4541e4dd34ece54a5b5))
* **core:** add decorator context adapter layer ([e72c972](https://github.com/zeltjs/zelt/commit/e72c9724602a08b037db14e1c8d8271de2d63001))
* **core:** add env loader for dotenv files ([b98f844](https://github.com/zeltjs/zelt/commit/b98f844c38639ad4d0bc93b44a9d37d2a7b1fdd2))
* **core:** add env module for environment variable access ([d6516e1](https://github.com/zeltjs/zelt/commit/d6516e1082622e52d782f28e88e819ae2d62d89f))
* **core:** add EnvConfig for env file paths ([e7d7ca3](https://github.com/zeltjs/zelt/commit/e7d7ca346b45cd7b93831a82459671cae913a5d8))
* **core:** add EnvService.getBoolean ([8d7eede](https://github.com/zeltjs/zelt/commit/8d7eedeb1e6cc1bb794595c68f6fae848fc87d27))
* **core:** add EnvService.getInteger ([0475b31](https://github.com/zeltjs/zelt/commit/0475b31c82445075b10b3892ef4c72cda8c9cd90))
* **core:** add EnvService.getString ([0455673](https://github.com/zeltjs/zelt/commit/0455673ea90d5c61b0d8dff44eda884fd79ff77d))
* **core:** add Hono context primitives ([b4c9c37](https://github.com/zeltjs/zelt/commit/b4c9c372b0de945645919faeca176af52f25dd21))
* **core:** add Hono context primitives ([e801109](https://github.com/zeltjs/zelt/commit/e801109a3f82de30e3dc63cc9e7e1487287bbb50))
* **core:** add ip() primitive for request IP resolution ([e85ddbf](https://github.com/zeltjs/zelt/commit/e85ddbfbd14afd579060b58902cad05b5a4326ef))
* **core:** add lazy controller resolution for serverless cold start optimization ([efb36d7](https://github.com/zeltjs/zelt/commit/efb36d701c8369f4e0b23b8fa2495b55245c793b))
* **core:** add lazy controller resolution for serverless cold start optimization ([e19bc6a](https://github.com/zeltjs/zelt/commit/e19bc6a3b8bce96f4bec913412e27f58fbfb650e))
* **core:** add LifecycleManager for DI shutdown handling ([0fce02a](https://github.com/zeltjs/zelt/commit/0fce02af5a95ad51957f1bb7750b49d37468ec73))
* **core:** add options parameter support to UseMiddleware ([174eb92](https://github.com/zeltjs/zelt/commit/174eb92b7e5088e10fc6982fb9119d67ae291150))
* **core:** add options parameter support to UseMiddleware ([53431c0](https://github.com/zeltjs/zelt/commit/53431c0df0b2d2c7f4a32dd9424b94d0623b5710))
* **core:** add pending/resolve pattern to metadata stores ([4496ed0](https://github.com/zeltjs/zelt/commit/4496ed04af7f7ace12c54192ae98807839fa22b9))
* **core:** add pending/resolve pattern to scheduler metadata ([2244994](https://github.com/zeltjs/zelt/commit/2244994db7e5cb09fbd2332e2405d8f54ddb0dfc))
* **core:** add scheduler metadata store ([2c19966](https://github.com/zeltjs/zelt/commit/2c19966396758f05fe12684d6ab5ef66e672d3b5))
* **core:** add scheduler runner with croner ([66706bc](https://github.com/zeltjs/zelt/commit/66706bca7e99a5a93f7718c01d9e1b69b1cec084))
* **core:** add schedulers option to createHttpApp ([fa636e3](https://github.com/zeltjs/zelt/commit/fa636e35034129f3e54d9d1a3d7a6010d0fc0500))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add stable runtime entrypoint for validation ([4021a3c](https://github.com/zeltjs/zelt/commit/4021a3c5d4bda4bd6fc8ceae6ea5825f6d26693d))
* **core:** add target parameter to validated() for form-data support ([8a3e90f](https://github.com/zeltjs/zelt/commit/8a3e90ff88c3fa8419083502926957d36c9d12ca))
* **core:** add target parameter to validated() for form-data support ([171dd4b](https://github.com/zeltjs/zelt/commit/171dd4b041350aa1d6dd14c34116da37cc922563))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **core:** auto-start scheduler via lifecycle ([b18fe06](https://github.com/zeltjs/zelt/commit/b18fe060b46de9cc64cc51c85c1f6d590e4d91e6))
* **core:** export env module as @zeltjs/core/modules/env ([8a31bba](https://github.com/zeltjs/zelt/commit/8a31bba21ef3efba3c2d6d6f281423f9adad3244))
* **core:** export findConfigToken for config token lookup ([695a942](https://github.com/zeltjs/zelt/commit/695a94228d69580f887825784c100e2fbfc5c033))
* **core:** export Lifecycle type ([02fbab4](https://github.com/zeltjs/zelt/commit/02fbab441aa967932b66f9d12444cc23e81edfae))
* **core:** export scheduler decorators ([4a52b73](https://github.com/zeltjs/zelt/commit/4a52b7306b293a99bd342892d54dbbc1e75c8113))
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
* **examples:** add Cloudflare Workers URL shortener example ([f89c406](https://github.com/zeltjs/zelt/commit/f89c4064e26b048c11a420527e931549f35d628c))
* **examples:** add Cloudflare Workers URL shortener example ([83e2f7c](https://github.com/zeltjs/zelt/commit/83e2f7ce71d98e73f2236df95c8c94ea64e32310))
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
* **rate-limit:** add package skeleton and fix joinPath for root controller ([dc0fcb5](https://github.com/zeltjs/zelt/commit/dc0fcb5877ad2dc430466e22d0988137e025a1b6))
* **testing:** add Testcontainers support with lifecycle management ([0222408](https://github.com/zeltjs/zelt/commit/0222408f44e846e10d9f7fabf62da7b228ade196))


### Bug Fixes

* address code review feedback ([a43cca5](https://github.com/zeltjs/zelt/commit/a43cca54c7eeb3d1d1edcef0953416fa4f0407a1))
* **core:** externalize valibot to avoid duplicate bundling ([697a2e8](https://github.com/zeltjs/zelt/commit/697a2e8632068f14ab1cc9ecda4115a952c6fd3c))
* **core:** externalize valibot to avoid duplicate bundling ([34934be](https://github.com/zeltjs/zelt/commit/34934beb02838b35b4362c98a1b6a43e7738c7a3))
* define CookieOptions type to avoid hono leak ([c9d91e5](https://github.com/zeltjs/zelt/commit/c9d91e5ecf9a4937ebd8c9020e88333185ca5c59))
* **env:** EnvConfig base returns undefined (no env defined) ([ca6fb18](https://github.com/zeltjs/zelt/commit/ca6fb1856f51badb46f3490a25e030626f959080))
* **env:** follow @Config convention with EnvConfig base class ([267cda3](https://github.com/zeltjs/zelt/commit/267cda3476ed1d145cabb35367a4c52726af41ef))
* **env:** separate EnvConfig base from ProcessEnvConfig implementation ([ba9d122](https://github.com/zeltjs/zelt/commit/ba9d122fdf6039af8dee90cbe8b10d66259b5706))
* **eslint:** resolve zelt plugin warnings ([1857b74](https://github.com/zeltjs/zelt/commit/1857b74ad6918cdc1bb3150553802ef8e84e4c5c))
* **eslint:** resolve zelt plugin warnings ([5759aba](https://github.com/zeltjs/zelt/commit/5759aba178899f014f802d982c465618ea23ae8a))
* **lint:** resolve lint errors after main merge ([90766c3](https://github.com/zeltjs/zelt/commit/90766c36072fbb5b22de15162ff7991131c7dc67))
* **rate-limit:** log KV failures in open mode and clean up format/lint ([a5a412a](https://github.com/zeltjs/zelt/commit/a5a412a74720b795eb27eabd50aeeb7c3f131a7c))
* remove import rename to comply with lint rules ([4c791af](https://github.com/zeltjs/zelt/commit/4c791af265fcae3f6d38440d7d4c2d6450477132))
* remove unused exports flagged by knip ([89efc31](https://github.com/zeltjs/zelt/commit/89efc31cf31e7f8d41a6436af40932a5ddecabe1))
* resolve lint errors in primitives ([c4f2c08](https://github.com/zeltjs/zelt/commit/c4f2c0889340a238509415342fc3109621078c1d))
* update primitives tests to use 2-phase initialization API ([f4e3d94](https://github.com/zeltjs/zelt/commit/f4e3d94f3298b743f0ee3e891b9ee48437cdfbe9))
* use injectableDecorators option for DI lint rule ([1f53e16](https://github.com/zeltjs/zelt/commit/1f53e16850bac9501bafbc088eda478997bc56ae))
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
