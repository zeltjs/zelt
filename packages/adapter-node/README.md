# @zeltjs/adapter-node

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Node.js HTTP server adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/adapter-node @zeltjs/core
```

## Usage

```typescript
import { serve } from '@zeltjs/adapter-node';
import { createHttpApp } from '@zeltjs/core';

const app = createHttpApp({ controllers: [...] });

serve(app, { port: 3000 });
```
