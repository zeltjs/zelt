---
sidebar_position: 5
---

# モジュール

:::info 準備中
モジュールシステムのドキュメントは作成中です。
:::

Zeltはアプリケーションを整理するための軽量なモジュールシステムを使用します。従来のフレームワークとは異なり、Zeltは暗黙的なモジュール検出よりも明示的な構成を重視します。

## 基本概念

```typescript
import { createHttpApp } from '@zeltjs/core';
import { UserController } from './user/user.controller';
import { PostController } from './post/post.controller';

export const app = createHttpApp({
  controllers: [UserController, PostController],
});
```

モジュールパターンとベストプラクティスの詳細なドキュメントをお待ちください。
