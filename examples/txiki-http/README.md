# txiki.js HTTP example

Install official txiki.js 26.6.0 or later and Node/pnpm for building.

From the repository root:

```sh
pnpm install
pnpm --filter @zeltjs/adapter-txiki... build
pnpm --filter @examples/txiki-http build
pnpm --filter @examples/txiki-http start
```

```sh
curl http://127.0.0.1:3000/api/status
curl -X POST 'http://127.0.0.1:3000/api/echo?id=42' \
  -H 'Content-Type: application/json' -H 'X-Request-Id: trace-42' \
  --data '{"message":"hello"}'
```

Set `PORT=0` to select a free port; startup prints the actual address. SIGINT/SIGTERM stop the app. Node is not needed to run the bundled output.

Verify both adapters against a real txiki.js binary:

```sh
TJS_BIN=/path/to/tjs pnpm verify:txiki
```
