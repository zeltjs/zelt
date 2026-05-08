import { Config, inject, LifecycleManager, type Lifecycle } from '@zeltjs/core';
import { RedisConfig } from '@zeltjs/kv-driver-redis';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';

@Config
export class RedisTestContainerConfig extends RedisConfig implements Lifecycle {
  private container: StartedTestContainer | undefined;
  private connectionUrl = '';

  constructor(lifecycle = inject(LifecycleManager)) {
    super();
    lifecycle.register(this);
  }

  protected get image(): string {
    return 'redis:7-alpine';
  }

  async startup(): Promise<void> {
    this.container = await new GenericContainer(this.image).withExposedPorts(6379).start();
    const host = this.container.getHost();
    const port = this.container.getMappedPort(6379);
    this.connectionUrl = `redis://${host}:${port}`;
  }

  async shutdown(): Promise<void> {
    await this.container?.stop();
  }

  override get url(): string {
    return this.connectionUrl;
  }

  override get options(): RedisConfig['options'] {
    return {};
  }
}
