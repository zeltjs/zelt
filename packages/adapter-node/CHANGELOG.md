# Changelog

## [0.2.0](https://github.com/zeltjs/zelt/compare/adapter-node-v0.1.1...adapter-node-v0.2.0) (2026-05-12)


### ⚠ BREAKING CHANGES

* **adapters:** onNode() and onCloudflareWorkers() now return Promise.

### Features

* **adapter-node:** add args property to NodeApp ([84d0fec](https://github.com/zeltjs/zelt/commit/84d0feca6b0fe42aad79848fc00025cec7d390f5))
* **adapter-node:** add args property to NodeApp ([e6c619b](https://github.com/zeltjs/zelt/commit/e6c619b06687106aed6e4bf82402cb1e65d8787e))
* **adapter-node:** add exec() for CLI command execution ([dd2249d](https://github.com/zeltjs/zelt/commit/dd2249d89be523c54b865a994c3a7b557656e225))
* **adapters:** make onNode and onCloudflareWorkers async with get() support ([16bea55](https://github.com/zeltjs/zelt/commit/16bea55319a1da9ccf9c14f118a51211547ef0b1))
* **core:** add CliConfig for CLI environment abstraction ([d65ba64](https://github.com/zeltjs/zelt/commit/d65ba64c01504e90b8d8fc8272ce5af1aa07b7b5))
* **core:** add CliConfig for CLI environment abstraction ([d2a12ae](https://github.com/zeltjs/zelt/commit/d2a12aee63b99d3f4338c4541e4dd34ece54a5b5))
* **core:** add lazy controller resolution for serverless cold start optimization ([efb36d7](https://github.com/zeltjs/zelt/commit/efb36d701c8369f4e0b23b8fa2495b55245c793b))
* **core:** add lazy controller resolution for serverless cold start optimization ([e19bc6a](https://github.com/zeltjs/zelt/commit/e19bc6a3b8bce96f4bec913412e27f58fbfb650e))
* **core:** add signal handling to CliConfig ([a7f5357](https://github.com/zeltjs/zelt/commit/a7f535731115f9eb0c25ba9c9c16cc03e541f180))
* **core:** add TC39/legacy decorator dual-mode support ([45e779e](https://github.com/zeltjs/zelt/commit/45e779ebba611fc7ae30a499f332a4268125dbcb))
* **core:** add TC39/legacy decorator dual-mode support ([eecabe5](https://github.com/zeltjs/zelt/commit/eecabe5499327413e4f50698be122d1d5d7dfa3c))
* **testing:** add global config support to createTestTarget and E2E tests ([153dd91](https://github.com/zeltjs/zelt/commit/153dd910107ab57253fe94604cf49d13b056bfe2))
* **testing:** add onTest adapter and configureTestDefaults ([4485fcd](https://github.com/zeltjs/zelt/commit/4485fcdd9c535d5673d5d85de1d47a91399fbf84))


### Bug Fixes

* **adapter-node:** import HttpApp type from @zeltjs/core ([590762e](https://github.com/zeltjs/zelt/commit/590762e1014429be76344fbb497af702ed4a37bc))
* use onNode adapter in examples and fix max-lines-per-function ([0bbc63f](https://github.com/zeltjs/zelt/commit/0bbc63f7fa1eb0e3776371d33d3017a88d74946c))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/core bumped to 0.2.0

## [0.1.1](https://github.com/zeltjs/zelt/compare/adapter-node-v0.1.0...adapter-node-v0.1.1) (2026-05-05)


### Miscellaneous Chores

* **adapter-node:** Synchronize zeltjs versions


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/core bumped to 0.1.1

## [0.1.0](https://github.com/zeltjs/zelt/compare/adapter-node-v0.0.1...adapter-node-v0.1.0) (2026-05-05)


### Features

* **adapter-node:** implement Node.js HTTP server adapter ([b85a431](https://github.com/zeltjs/zelt/commit/b85a43171ed06e481226fd793eabb71babdf90d7))
* **adapter-node:** implement serve function with default options ([3cffd7d](https://github.com/zeltjs/zelt/commit/3cffd7dfe907a525c635ecc5e369aa7993824ddc))
* **examples/hello:** add Node.js server entry point ([6198286](https://github.com/zeltjs/zelt/commit/6198286146e8d862e5718d8db19776c203987242))


### Dependencies

* The following workspace dependencies were updated
  * dependencies
    * @zeltjs/core bumped to 0.1.0
