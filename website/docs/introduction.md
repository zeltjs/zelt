---
slug: /
---

# Introduction

Zelt is a fast, type-safe application framework for TypeScript, bringing Laravel/FuelPHP-like productivity to edge and serverless runtimes.

## Philosophy

Zelt provides a complete application skeleton that integrates controllers, services, configuration, lifecycle management, error handling, testing, and more — all connected through a unified type contract.

### Core Values

- **Fast** — Practical startup and execution speed for Cloudflare Workers and serverless cold starts
- **Type-safe** — Schema → request → controller → response → DI → test double are all connected through the same type contract
- **Application-oriented** — Provides the "application backbone" that integrates controller / service / repository / config / lifecycle / error handling / testing

## Why Zelt?

Modern TypeScript backend development often requires piecing together multiple libraries for routing, validation, dependency injection, and testing. Zelt provides these out of the box with a cohesive, type-safe API.

Unlike traditional frameworks, Zelt is designed from the ground up for edge and serverless environments where cold start performance matters.

## Packages

| Package | Description |
|---------|-------------|
| `@zeltjs/core` | DI, lifecycle, validation, error handling, and HTTP core |
| `@zeltjs/adapter-node` | Node.js server adapter |
| `@zeltjs/adapter-cloudflare-workers` | Cloudflare Workers adapter |
| `@zeltjs/openapi` | Type generation and OpenAPI output |
| `@zeltjs/testing` | Test utilities |

## Status

**pre-alpha** — Breaking changes may occur in minor versions during 0.x.
