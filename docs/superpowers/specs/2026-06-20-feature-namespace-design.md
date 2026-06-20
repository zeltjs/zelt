# Feature Namespace Design

## Context

Zelt currently exposes feature capabilities by `Feature.key`. That key is also
used to reject duplicate features in `createApp()`.

This works for one instance per feature shape, but it blocks cases where the
same feature module should be configured more than once. The motivating case is
HTTP: an application may need a public API server and a private API server in
the same runtime, each with its own controllers and listen port.

The desired user API is:

```ts
const publicHttp = http({
  controllers: [PublicController],
});

const privateHttp = http({
  name: 'private' as const,
  controllers: [PrivateController],
});

const app = createApp([publicHttp, privateHttp]);
const nodeApp = await onNode(app);

await nodeApp.http.listen({ port: 3000 });
await nodeApp.private.listen({ port: 3001 });
```

## Decision

`Feature.key` is the feature instance namespace exposed on the app object. It is
not a feature kind.

Feature kind checks continue to use feature classes, such as `HttpFeature`.
`kind` is not introduced because the current design already uses `instanceof`
for feature class checks and does not need a second discriminator.

The core feature system supports multiple instances of the same feature class.
Each instance must resolve to a unique namespace key across the whole app.

## Namespace Rules

Every feature instance has exactly one namespace key.

Built-in features provide a default or fixed namespace:

- `http()` resolves to `http`
- `command()` uses the fixed namespace `commands`
- `scheduler()` uses the fixed namespace `schedulers`

Namespace uniqueness is global to the app. Feature class does not affect the
collision rule.

These are invalid:

```ts
createApp([
  http({ controllers: [A] }),
  http({ controllers: [B] }),
]);
```

Both HTTP features resolve to the namespace `http`.

```ts
createApp([
  http({ name: 'admin', controllers: [A] }),
  customFeature({ key: 'admin' }),
]);
```

Both features expose the namespace `admin`.

## Core API

Remove `getFeatureCapabilities()`.

Single-capability lookup is ambiguous once the same feature class may have
multiple instances. Keeping the old API would make it too easy for adapters and
user code to accidentally operate on only one instance.

Add `getFeatureEntries()`.

```ts
type FeatureEntry<TFeature extends ConfiguredFeature> = {
  readonly key: TFeature['key'];
  readonly feature: TFeature;
  readonly capabilities: FeatureReadyCapabilities<TFeature>;
};

runtimeApp.getFeatureEntries(HttpFeature);
```

The method returns all entries whose feature instance matches the requested
feature class. The existing `hasFeature(FeatureClass)` method can remain because
it answers only whether at least one matching feature exists.

`NamespacedCaps` and static blueprint aggregation continue to use `feature.key`
as the object property name.

## Built-In Feature Policy

The core layer supports multi-instance feature modules.

Each feature implementation decides whether to expose naming.

Initial policy:

- `http` supports `name`, because multiple HTTP surfaces in one process are a
  known use case.
- `command` remains a singleton feature with fixed namespace `commands`.
- `scheduler` remains a singleton feature with fixed namespace `schedulers`.

This keeps command and scheduler simple until a concrete multi-instance use case
exists. They still fit the core model because their fixed key naturally causes a
namespace collision if configured more than once.

## Adapter API

Node and Bun adapters should stop promoting HTTP server methods to the root app
object.

HTTP capabilities remain under their namespace, and adapters enrich each HTTP
namespace with runtime-specific server methods.

Node:

```ts
await nodeApp.http.listen({ port: 3000 });
await nodeApp.private.listen({ port: 3001 });
```

Bun:

```ts
const server = bunApp.http.serve({ port: 3000 });
```

Remove root-level aliases such as:

```ts
nodeApp.listen(...)
bunApp.serve(...)
```

This makes all feature capabilities consistently accessible only through their
namespace:

```ts
nodeApp.http.listen(...)
nodeApp.private.listen(...)
nodeApp.commands.execCommand(...)
nodeApp.schedulers.startScheduler(...)
```

## Lifecycle

Each HTTP namespace can create its own server handle. Shutting down an app should
stop all adapter-managed servers before shutting down the runtime.

Individual server handles may still expose a server-specific close or shutdown
operation, but app-level shutdown remains the operation that disposes the shared
runtime.

## Error Handling

Duplicate namespace errors should describe the namespace collision, not a
feature-kind collision.

Reserved namespace checks still apply to names that would overwrite app-level
runtime methods or JavaScript object semantics, such as:

- `features`
- `get`
- `hasFeature`
- `getFeatureEntries`
- `shutdown`
- `__proto__`
- `constructor`
- `prototype`

## Testing

Tests should cover:

- Two HTTP features with distinct names expose distinct app namespaces.
- Two unnamed HTTP features fail because both resolve to `http`.
- Different feature classes with the same namespace fail.
- `getFeatureEntries(HttpFeature)` returns all HTTP feature entries.
- `getFeatureEntries(CommandFeature)` returns command entries.
- `getFeatureCapabilities()` no longer exists in runtime and static app types.
- Node adapter exposes `listen()` under each HTTP namespace.
- Node adapter no longer exposes root `listen()`.
- Bun adapter exposes `serve()` under each HTTP namespace.
- Bun adapter no longer exposes root `serve()`.
- Existing command and scheduler singletons still work through `commands` and
  `schedulers`.
