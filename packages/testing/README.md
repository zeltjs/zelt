# @zeltjs/testing

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Testing utilities for Zelt applications.

## Installation

```bash
npm install -D @zeltjs/testing
```

## Usage

```typescript
import { createTestApp } from '@zeltjs/testing';
import { describe, it, expect } from 'vitest';

describe('HelloController', () => {
  it('returns hello message', async () => {
    const app = createTestApp({ controllers: [HelloController] });
    const res = await app.request('/hello');
    expect(res.status).toBe(200);
  });
});
```

## Documentation

See [zeltjs.com](https://zeltjs.com) for full documentation.
