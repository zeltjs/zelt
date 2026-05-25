import type { Lifecycle } from '@zeltjs/core';
import { Config, inject, LifecycleManager } from '@zeltjs/core';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';

import { RedisConfig } from '../redis.config';

// 敗北
interface RedisTestContainerState {
  container: StartedTestContainer | undefined;
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

  async startup(): Promise<void> {
    this.state.container = await new GenericContainer(this.image).withExposedPorts(6379).start();
    const host = this.state.container.getHost();
    const port = this.state.container.getMappedPort(6379);
    this.state.connectionUrl = `redis://${host}:${port}`;
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
