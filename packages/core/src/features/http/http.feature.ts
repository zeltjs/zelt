import type { FeatureRuntime } from '../../app';
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

/** @throws {ZeltDecoratorUsageError | ZeltReadyFailedError | ZeltLifecycleStateError} */
export class HttpFeature
  extends Feature<'http', HttpMountableCapabilities, HttpStaticCapabilities>
  implements HttpMountableFeatureModule
{
  readonly key = HTTP_FEATURE_KEY;
  readonly path: string;
  private readonly controllers: readonly ControllerClass[];
  private readonly children: readonly HttpMountableFeatureModule[];

  /** @throws {ZeltDecoratorUsageError} */
  constructor(private readonly opts: HttpModuleOptions) {
    super();
    this.path = opts.path ?? '/';
    this.controllers = opts.controllers ?? [];
    this.children = opts.children ?? [];
    collectRoutes(this.collectControllers());
  }

  readonly featureClasses = (): readonly ControllerClass[] => {
    return [...this.controllers, ...this.children.flatMap((child) => child.featureClasses())];
  };

  readonly staticCapabilities = (): HttpStaticCapabilities => {
    const controllers = this.collectControllers();
    const metadata = this.collectMetadata();
    return {
      getControllers: () => controllers,
      getMetadata: () => metadata,
    };
  };

  readonly createCapabilities = async (
    runtime: FeatureRuntime,
  ): Promise<HttpMountableCapabilities> => {
    const service = await runtime.get(HttpService);
    const local = await service.createLocalRouter(this.opts);

    // Children arrive self-prefixed (they apply their own path below), so
    // they merge at '/' — mirroring how staticCapabilities composes metadata.
    for (const child of this.children) {
      const childCaps = await child.createCapabilities(runtime);
      local.route('/', childCaps.router);
    }

    if (this.path === '/') return this.toCapabilities(local);

    const rootRouter = await service.createLocalRouter({ controllers: [] });
    rootRouter.route(this.path, local);
    return this.toCapabilities(rootRouter);
  };

  private collectMetadata(): HttpMetadata {
    const ownControllers = collectOwnControllerMetadata(this.controllers, this.path);
    const childControllers = this.children.flatMap((child) => {
      const metadata = child.staticCapabilities().getMetadata();
      return prefixHttpMetadata(metadata, this.path).controllers;
    });
    return { controllers: [...ownControllers, ...childControllers] };
  }

  private collectControllers(): readonly ControllerClass[] {
    return [
      ...this.controllers,
      ...this.children.flatMap((child) => child.staticCapabilities().getControllers()),
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

export const http = (opts: HttpModuleOptions): HttpFeature => new HttpFeature(opts);
export type {
  HttpCapabilities,
  HttpMountableCapabilities,
  HttpMountableFeatureModule,
  HttpStaticCapabilities,
};
