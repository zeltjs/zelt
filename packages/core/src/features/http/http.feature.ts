import type { ServiceResolver } from '../../app';
import { Feature } from '../../app';
import { HttpService } from './http.service';
import type {
  ControllerClass,
  HttpCapabilities,
  HttpMetadata,
  HttpModuleOptions,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
} from './http.types';
import { collectOwnControllerMetadata, prefixHttpMetadata } from './http-children.lib';
import { collectRoutes } from './routing';

export const HTTP_FEATURE_KEY = 'http' as const;

type ShutdownCallback = () => void | Promise<void>;
type RegisteredShutdown = () => Promise<void>;

/** @throws {ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError} */
export class HttpFeature<TName extends string = string>
  extends Feature<TName, HttpMountableCapabilities, HttpStaticCapabilities>
  implements HttpMountableFeatureModule
{
  readonly key: TName;
  readonly path: string;
  private readonly opts: HttpModuleOptions<string>;
  private readonly controllers: readonly ControllerClass[];
  private readonly children: readonly HttpMountableFeatureModule[];
  private readonly shutdownCallbacks = new Set<RegisteredShutdown>();

  /** @throws {ZeltDecoratorUsageError} */
  constructor(opts: HttpModuleOptions<TName>, key: TName) {
    super();
    this.opts = opts;
    this.key = key;
    this.path = opts.path ?? '/';
    this.controllers = opts.controllers ?? [];
    this.children = opts.children ?? [];
    collectRoutes(this.collectControllers());
  }

  readonly featureClasses = (): readonly ControllerClass[] => {
    return [...this.controllers, ...this.children.flatMap((child) => child.featureClasses())];
  };

  readonly blueprint = (): HttpStaticCapabilities => {
    const controllers = this.collectControllers();
    const metadata = this.collectMetadata();
    return {
      getControllers: () => controllers,
      getMetadata: () => metadata,
    };
  };

  readonly realize = async (resolver: ServiceResolver): Promise<HttpMountableCapabilities> => {
    const service = await resolver.get(HttpService);
    const local = await service.createLocalRouter(this.opts);

    for (const child of this.children) {
      const childCaps = await child.realize(resolver);
      Reflect.apply(local.route, local, ['/', childCaps.router]);
    }

    if (this.path === '/') return this.toCapabilities(local);

    const rootRouter = await service.createLocalRouter({ controllers: [] });
    Reflect.apply(rootRouter.route, rootRouter, [this.path, local]);
    return this.toCapabilities(rootRouter);
  };

  registerShutdown(callback: ShutdownCallback): RegisteredShutdown {
    const registered = async (): Promise<void> => {
      if (!this.shutdownCallbacks.delete(registered)) return;
      await callback();
    };
    this.shutdownCallbacks.add(registered);
    return registered;
  }

  override readonly shutdown = async (): Promise<void> => {
    await Promise.all([...this.shutdownCallbacks].map((callback) => callback()));
  };

  private collectMetadata(): HttpMetadata {
    const ownControllers = collectOwnControllerMetadata(this.controllers, this.path);
    const childControllers = this.children.flatMap((child) => {
      const metadata = child.blueprint().getMetadata();
      return prefixHttpMetadata(metadata, this.path).controllers;
    });
    return { controllers: [...ownControllers, ...childControllers] };
  }

  private collectControllers(): readonly ControllerClass[] {
    return [
      ...this.controllers,
      ...this.children.flatMap((child) => child.blueprint().getControllers()),
    ];
  }

  private toCapabilities(router: HttpMountableCapabilities['router']): HttpMountableCapabilities {
    return {
      router,
      fetch: async (req) => router.fetch(req),
      request: async (input, init) => {
        const req =
          typeof input === 'string' ? new Request(new URL(input, 'http://localhost'), init) : input;
        return router.fetch(req);
      },
    };
  }
}

export function http(opts: Omit<HttpModuleOptions, 'name'>): HttpFeature<typeof HTTP_FEATURE_KEY>;
export function http<const TName extends string>(
  opts: HttpModuleOptions<TName> & { readonly name: TName },
): HttpFeature<TName>;
export function http<const TName extends string>(
  opts: HttpModuleOptions<TName>,
): HttpFeature<TName | typeof HTTP_FEATURE_KEY> {
  const key = opts.name ?? HTTP_FEATURE_KEY;
  return new HttpFeature(opts, key);
}
export type {
  HttpCapabilities,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
};
