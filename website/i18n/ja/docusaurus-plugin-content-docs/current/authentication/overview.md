---
sidebar_position: 1
---

# 概要

Zeltは**認証**（ユーザーは誰か？）と**認可**（ユーザーは何ができるか？）を分離した柔軟な認証システムを提供します。

## 認証 vs 認可

| 概念 | 質問 | Zelt API |
|------|------|----------|
| **認証** | ユーザーは誰か？ | `setUser()`, `currentUser()` |
| **認可** | ユーザーは何ができるか？ | `@Authorized()`, `currentRoles()` |

認証が最初に行われ（通常はミドルウェアで）、その後保護されたルートで認可チェックが実行されます。

## 認証戦略の選択

Zeltは複数の認証戦略をサポートしています。アーキテクチャに合ったものを選択してください：

| 戦略 | 適したユースケース | パッケージ |
|------|-------------------|------------|
| **JWT** | SPA、モバイルアプリ、API | `@zeltjs/auth-jwt` |
| **セッション** | サーバーレンダリングアプリ、従来のWebアプリ | `@zeltjs/auth-session` |
| **カスタム** | APIキー、OAuth、その他 | 組み込みプリミティブ |

### 選択ガイド

```
クライアントはサーバーサイドレンダリングを使用するブラウザですか？
├── はい → セッション（Cookieベース、自動CSRF処理）
└── いいえ
    ├── SPAまたはモバイルアプリ？ → JWT（ステートレス、スケーラブル）
    └── マシン間API？ → カスタム（APIキー、mTLS）
```

## 認証フロー

```
リクエスト
    ↓
┌─────────────────────────────┐
│ 認証ミドルウェア             │
│ • 認証情報を抽出             │
│ • 検証（JWT/セッション等）    │
│ • setUser(user, roles)      │
└─────────────────────────────┘
    ↓
┌─────────────────────────────┐
│ @Authorized() チェック       │
│ • ユーザーなし？ → 401       │
│ • ロール不足？ → 403         │
│ • OK → 続行                 │
└─────────────────────────────┘
    ↓
ルートハンドラー
    ↓
レスポンス
```

## クイックスタート

### 1. パッケージをインストール（または組み込みプリミティブを使用）

```bash
# JWT認証の場合
pnpm add @zeltjs/auth-jwt

# セッション認証の場合
pnpm add @zeltjs/auth-session @zeltjs/kv
```

### 2. ミドルウェアを登録

```typescript
import { createApp } from '@zeltjs/core';
import { JwtMiddleware, JwtConfig } from '@zeltjs/auth-jwt';

const app = createApp({
  http: {
    controllers: [UserController],
    middlewares: [JwtMiddleware],
  },
  configs: [JwtConfig],
});
```

### 3. ルートを保護

```typescript
import { Controller, Get, Authorized, currentUser } from '@zeltjs/core';

@Controller('/dashboard')
class DashboardController {
  @Authorized()
  @Get('/')
  index(user = currentUser()) {
    return { message: `こんにちは、${user.name}さん` };
  }
}
```

## 次のステップ

- [ユーザーコンテキスト](./user-context) — 認証済みユーザーの型定義とアクセス方法
- [JWT認証](./jwt) — ステートレスなトークンベース認証
- [セッション認証](./sessions) — Cookieベースのセッション管理
- [カスタム認証](./custom) — 独自の認証ミドルウェアを構築
