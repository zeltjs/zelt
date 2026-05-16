---
sidebar_label: Basic
---

# Getting Started

Zelt is a fast, type-safe application framework for TypeScript. Built on [Hono](https://hono.dev/), it provides dependency injection, validation, and a decorator-based API for building web applications and CLI tools.

## Choose Your Environment

Select your target runtime to get started:

- **[Node.js](./node.md)** — Traditional server environment with full Node.js API access
- **[Cloudflare Workers](./cloudflare-workers.md)** — Edge runtime with global distribution and low latency

## Core Concepts

Zelt applications are built around these primitives:

| Concept | Description |
|---------|-------------|
| **Controller** | Handles HTTP requests using decorators like `@Get`, `@Post` |
| **Service** | Contains business logic, injectable via `@Injectable` |
| **Config** | Manages configuration values, injectable via `@Config` |

Each environment guide covers these concepts with complete, runnable examples.
