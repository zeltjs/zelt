---
title: Feature injection
---

# Feature injection

Use `injectFeature()` in a DI-managed constructor or field initializer to access a configured feature from user code. HTTP, commands, schedulers, event buses, and custom features use the same mechanism.

## Start HTTP from a command

```typescript
import {
  Command, Controller, Get, command, createApp, http, httpServer, injectFeature,
} from '@zeltjs/core';
import { onNode } from '@zeltjs/adapter-node';
// ---cut---
@Controller('/')
class HelloController {
  @Get('/')
  hello() {
    return { message: 'Hello' };
  }
}

const web = http({ controllers: [HelloController] });
const listener = httpServer();

@Command({ name: 'serve' })
class ServeCommand {
  constructor(
    private readonly http = injectFeature(web),
    private readonly server = injectFeature(listener),
  ) {}

  async run() {
    const server = await this.server.listen(this.http, { port: 3000 });
    await server.closed;
  }
}

const runtime = await onNode(createApp([command([ServeCommand]), web, listener]));
const result = await runtime.command.execCommand(['serve']);
```

Injection alone does not start a listener. `listen()` returns its actual address, an idempotent `shutdown()` function, and a `closed` promise. Runtime shutdown closes listeners started from both injected features and the public runtime API. Node handles SIGINT/SIGTERM through its normal shutdown integration.

Declare `httpServer()` to request listening support from the platform. Node, Bun, txiki.js and Electron provide the environment implementation. A runtime without one rejects that server feature during initialization. HTTP `fetch()` and `request()` remain available without a server feature. The old HTTP `listen()` and `serve()` methods have been removed.

## Select a feature

Pass the exact definition object registered in `createApp()`:

```typescript
import { Injectable, http, injectFeature } from '@zeltjs/core';
const admin = http({ name: 'admin', controllers: [] });
const user = http({ name: 'user', controllers: [] });
// ---cut---
@Injectable()
class Servers {
  private readonly admin = injectFeature(admin);
  private readonly user = injectFeature(user);
}
```

Alternatively, select a class-based feature by its class and namespace:

```typescript
import {
  Injectable, HttpFeature, CommandFeature, SchedulerFeature, injectFeature,
} from '@zeltjs/core';
import { EventBusFeature } from '@zeltjs/eventbus';
// ---cut---
@Injectable()
class FeatureConsumer {
  private readonly http = injectFeature(HttpFeature);
  private readonly admin = injectFeature(HttpFeature, 'admin');
  private readonly commands = injectFeature(CommandFeature);
  private readonly scheduler = injectFeature(SchedulerFeature);
  private readonly events = injectFeature(EventBusFeature);
}
```

Omitting the namespace uses the class's `static defaultKey`, which matches its factory name: `http`, `httpServer`, `command`, `scheduler`, `eventbus`, `tinyjsBridge`, `electronIpc`, or `lambdaHandler`. It never selects the first registered instance or an arbitrary named instance. Custom feature classes can declare `static readonly defaultKey`; structural feature definitions can be injected directly.

The selected definition must be registered at the top level of this runtime. An HTTP child is a route composition unit and is not automatically an independently injectable feature. A newly created definition with identical options does not match the registered object. Duplicate namespaces are still rejected by `createApp()`.

Feature names cannot use the keys in `RESERVED_APP_KEYS`, exported by `@zeltjs/core`. This single list covers built-in app operations and environment properties, including `shutdown`, `get`, and `args`, across all adapters. Named feature factories reject these names at compile time; `createApp()` checks custom feature keys too. Built-in app API definitions use `ReservedAppProperties` so adding an unlisted property or method is also a type error. JavaScript and dynamically named features are checked against the same list when the app is created.

A namespace selects a feature's capabilities; it does not create a separate DI container or duplicate its underlying services. For example, named EventBus features configured with the same adaptor class share that runtime's adaptor, including its events and subscriptions. This also keeps direct adaptor injection and feature injection connected. Different runtimes have separate instances. For isolated buses, configure separate adaptors and the required backend/channel separation; changing `name` alone does not isolate a bus.

## Initialization and lifetime

Each runtime registers its injection handles before realizing any features. A constructor can hold an injected handle even if that feature has not finished realization. Configurations explicitly supplied through `configs` are constructed and their resource startup hooks complete first, so feature constructors can read values prepared by those hooks. All features are then realized, warmup constructors run when enabled, and finally feature lifecycle startup hooks execute. `ServiceResolver.get()` during realization constructs an instance without running its startup hook yet.

Do not call feature operations during constructors, configuration startup, or `realize()`. An operation attempted before all features are prepared throws `FeatureInjectionError` with reason `not_ready`; it does not wait on an initialization cycle. Feature lifecycle hooks can use prepared operations, for example registering an event subscription. This does not make mutually dependent startup operations safe.

Injected handles delegate to the same capabilities as the public runtime namespace, but their object identity is not guaranteed to equal that namespace. Handles are stable within a runtime, separate across runtimes, and reject access after runtime shutdown, including calls through previously extracted methods. Shutdown hooks can use the handles until shutdown completes. Missing definitions report `not_registered`; a class with no default namespace reports `default_not_defined`.

Object-valued properties such as `http.router` retain the same lifetime checks even if stored separately. Aliases and cycles preserve their identity within the injected handle. Values returned by operations, such as an HTTP response or a server handle, retain their own resource contracts.

Feature injection does not make all application initialization lazy. A version command does not implicitly listen, but creating the runtime still performs feature realization and normal lifecycle startup. Put a version-only fast path before runtime creation if those steps must also be avoided.

Public runtime namespaces and `injectFeature()` share the same guarded feature handle. Access through either path is rejected after runtime shutdown.

## Runtime shutdown

Adapters use the runtime's common `shutdown()` operation. Concurrent calls wait for the same completion and receive the same failure. SIGINT/SIGTERM handling uses this operation too, so repeated signals do not start another shutdown.

`runtime.registerShutdown(callback)` registers cleanup before service lifecycle shutdown. Use `runtime.registerShutdown(callback, { phase: 'after' })` for cleanup that must run after services have stopped, such as detaching process signal handlers. Callbacks within each phase run concurrently and execute at most once. Failures are collected while the remaining cleanup continues; after callbacks still run when lifecycle cleanup fails.

If a lifecycle guard refuses shutdown before disposal, the runtime remains usable and shutdown can be retried. After callbacks remain registered until disposal actually occurs. `RuntimeShutdownService`, available through DI or `runtime.get()`, exposes the common `state` (`ready`, `shuttingDown`, or `disposed`) for integrations that must reject new work as soon as shutdown is requested.
