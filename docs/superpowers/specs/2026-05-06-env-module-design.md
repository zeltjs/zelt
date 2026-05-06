# Env Module Design

## Overview

`@zeltjs/core/modules/env`として、環境変数（.envファイル）の読み込みと型安全なアクセスを提供するモジュール。

## Goals

- .envファイルからの環境変数読み込み（dotenv使用）
- 複数ファイルの読み込み順序を指定可能（NestJS風）
- 型安全なゲッター（getString, getInteger, getBoolean）
- 本番環境では.envファイル読み込みスキップ可能（空配列指定）
- `src/modules/logger`と同じDIパターン

## File Structure

```
packages/core/src/modules/env/
├── env.config.ts      # EnvConfig
├── env.service.ts     # EnvService
├── env.loader.ts      # dotenvラッパー
├── env.service.test.ts
└── index.ts
```

## API Design

### EnvConfig

```typescript
import { Config } from '../../config';

@Config
export class EnvConfig {
  static readonly Token = EnvConfig;
  
  get envFilePath(): string[] {
    return ['.env'];
  }
}
```

- `envFilePath`: 読み込む.envファイルのパス配列
- 配列の順序で読み込み、後のファイルが優先（override）
- 空配列`[]`で.envファイル読み込みをスキップ（本番環境向け）

### EnvService

```typescript
import { Injectable } from '../../decorators/injectable';
import { injectConfig } from '../../config';
import { EnvConfig } from './env.config';
import { loadEnvFiles } from './env.loader';

@Injectable()
export class EnvService {
  private loaded = false;
  
  constructor(private config = injectConfig(EnvConfig)) {}
  
  private ensureLoaded(): void {
    if (!this.loaded) {
      loadEnvFiles(this.config.envFilePath);
      this.loaded = true;
    }
  }
  
  getString<D extends string | null | undefined>(key: string, defaultValue: D): string | D {
    this.ensureLoaded();
    return process.env[key] ?? defaultValue;
  }
  
  getInteger<D extends number | null | undefined>(key: string, defaultValue: D): number | D {
    this.ensureLoaded();
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    const parsed = parseInt(val, 10);
    if (Number.isNaN(parsed)) return defaultValue;
    return parsed;
  }
  
  getBoolean<D extends boolean | null | undefined>(key: string, defaultValue: D): boolean | D {
    this.ensureLoaded();
    const val = process.env[key];
    if (val === undefined) return defaultValue;
    return val === 'true' || val === '1';
  }
}
```

- throwしない（defaultValueを必ず返す）
- defaultValueの型がそのまま戻り値に反映
  - `getString('KEY', 'default')` → `string`
  - `getString('KEY', null)` → `string | null`
  - `getString('KEY', undefined)` → `string | undefined`

### env.loader.ts

```typescript
import { config } from 'dotenv';

export const loadEnvFiles = (paths: string[]): void => {
  for (const path of paths) {
    config({ path, override: true });
  }
};
```

### index.ts

```typescript
export { EnvConfig } from './env.config';
export { EnvService } from './env.service';
```

## Usage Example

```typescript
// app-env.config.ts（アプリ側でカスタマイズ）
@Config
export class AppEnvConfig extends EnvConfig {
  get envFilePath(): string[] {
    const env = process.env.NODE_ENV ?? 'development';
    if (env === 'production') return [];
    return ['.env', '.env.local', `.env.${env}`, `.env.${env}.local`];
  }
}

// database.service.ts
@Injectable()
export class DatabaseService {
  constructor(private env = inject(EnvService)) {}
  
  connect() {
    const host = this.env.getString('DATABASE_HOST', 'localhost');
    const port = this.env.getInteger('DATABASE_PORT', 5432);
    const ssl = this.env.getBoolean('DATABASE_SSL', false);
    // ...
  }
}
```

## Dependencies

- `dotenv` (新規追加)

## Initialization

- EnvService初回inject時に遅延ロード
- import graphで自然にロードされる

## Export from core

`packages/core/src/index.ts`に追加:

```typescript
// 既存のloggerと同様のパターン
// export は modules/env/index.ts 経由ではなく、
// package.json の exports で @zeltjs/core/modules/env として公開
```

`packages/core/package.json`に追加:

```json
{
  "exports": {
    "./modules/env": {
      "types": "./dist/modules/env/index.d.ts",
      "import": "./dist/modules/env/index.js"
    }
  }
}
```
