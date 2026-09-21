import type { Lifecycle } from '@zeltjs/core';
import { Config, inject, LifecycleManager } from '@zeltjs/core';
import { GenericContainer } from 'testcontainers';

import { RedisConfig } from '../redis.config';

export type StartedRedisContainer = {
  readonly host: string;
  readonly port: number;
  readonly stop: () => Promise<void>;
};

// 敗北
interface RedisTestContainerState {
  container: StartedRedisContainer | undefined;
  connectionUrl: string;
}

@Config
export class RedisTestContainerConfig extends RedisConfig implements Lifecycle {
  private readonly state: RedisTestContainerState = { container: undefined, connectionUrl: '' };

  constructor(lifecycle = inject(LifecycleManager)) {
    super();
    lifecycle.register(this);
  }

  protected get image(): string {
    return 'redis:7-alpine';
  }

  protected async startContainer(): Promise<StartedRedisContainer> {
    const container = await new GenericContainer(this.image).withExposedPorts(6379).start();
    return {
      host: container.getHost(),
      port: container.getMappedPort(6379),
      stop: async () => {
        await container.stop();
      },
    };
  }

  async startup(): Promise<void> {
    this.state.container = await this.startContainer();
    this.state.connectionUrl = `redis://${this.state.container.host}:${this.state.container.port}`;
  }

  async shutdown(): Promise<void> {
    await this.state.container?.stop();
  }

  override get url(): string {
    return this.state.connectionUrl;
  }

  override get options(): RedisConfig['options'] {
    return {};
  }
}
