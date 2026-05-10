import { CliConfig, Config } from '@zeltjs/core';

@Config
export class NodeCliConfig extends CliConfig {
  override cwd(): string {
    return process.cwd();
  }

  override argv(): readonly string[] {
    return process.argv;
  }

  override exit(code: number): never {
    process.exit(code);
  }
}
