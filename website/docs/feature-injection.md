---
title: Feature injection
---

# Feature injection

Use `injectFeature()` in a DI-managed constructor or field initializer to access a configured feature from user code. HTTP, commands, schedulers, event buses, and custom features use the same mechanism.

## Start HTTP from a command

```typescript
import {
  Command, Controller, Get, command, createApp, http, injectFeature,
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

@Command({ name: 'serve' })
class ServeCommand {
  constructor(private readonly server = injectFeature(web)) {}

  async run() {
    const server = await this.server.listen({ port: 3000 });
    await server.closed;
  }
}

const runtime = await onNode(createApp([command([ServeCommand]), web]));
const result = await runtime.commands.execCommand(['serve']);
```

Injection alone does not start a listener. `listen()` returns its actual address, an idempotent `shutdown()` function, and a `closed` promise. Runtime shutdown closes listeners started from both injected features and the public runtime API. Node handles SIGINT/SIGTERM through its normal shutdown integration.

Node and Bun provide `listen()`. Other environments, including plain `createRuntime()`, require an `HttpServerAdaptor` implementation; calling `listen()` without one fails explicitly. HTTP `fetch()` and `request()` remain available without a socket listener. Bun's existing public `serve()` API is also retained.

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

Omitting the namespace uses the class's `static defaultKey`: `http`, `commands`, `schedulers`, or `eventbus`. It never selects the first registered instance or an arbitrary named instance. Custom feature classes can declare `static readonly defaultKey`; structural feature definitions can be injected directly.

The selected definition must be registered at the top level of this runtime. An HTTP child is a route composition unit and is not automatically an independently injectable feature. A newly created definition with identical options does not match the registered object. Duplicate namespaces are still rejected by `createApp()`.

## Initialization and lifetime

Each runtime registers its injection handles before realizing any features. A constructor can hold an injected handle even if that feature has not finished realization. All configured features are realized, warmup constructors run when enabled, and then lifecycle startup hooks execute. `ServiceResolver.get()` during realization constructs an instance without running its startup hook yet.

Do not call feature operations during constructors or `realize()`. An operation attempted before all features are prepared throws `FeatureInjectionError` with reason `not_ready`; it does not wait on an initialization cycle. Lifecycle hooks can use prepared operations, for example registering an event subscription. This does not make mutually dependent startup operations safe.

Injected handles delegate to the same capabilities as the public runtime namespace, but their object identity is not guaranteed to equal that namespace. Handles are stable within a runtime, separate across runtimes, and reject access after runtime shutdown, including calls through previously extracted methods. Shutdown hooks can use the handles until shutdown completes. Missing definitions report `not_registered`; a class with no default namespace reports `default_not_defined`.

Feature injection does not make all application initialization lazy. A version command does not implicitly listen, but creating the runtime still performs feature realization and normal lifecycle startup. Put a version-only fast path before runtime creation if those steps must also be avoided.
