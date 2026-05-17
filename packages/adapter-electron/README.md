# @zeltjs/adapter-electron

[![Documentation](https://img.shields.io/badge/docs-zeltjs.com-blue)](https://zeltjs.com)

Electron adapter for Zelt applications.

**[Read the Documentation](https://zeltjs.com)**

## Installation

```bash
npm install @zeltjs/adapter-electron @zeltjs/core
```

## Usage

```typescript
import { createApp, Controller, Get } from '@zeltjs/core';
import { onElectron } from '@zeltjs/adapter-electron';

@Controller('/api')
class ApiController {
  @Get('/status')
  status() {
    return { status: 'ok' };
  }
}

const app = createApp({
  http: { controllers: [ApiController] },
});

const electron = await onElectron(app);
```
