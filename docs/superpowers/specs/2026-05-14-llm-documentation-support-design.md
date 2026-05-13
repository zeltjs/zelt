# LLM Documentation Support Design

## Overview

Add LLM-friendly documentation support to the Zelt website, enabling AI assistants to efficiently consume documentation content.

## Goals

1. Generate `llms.txt` and `llms-full.txt` following the llmstxt.org standard
2. Enable `.md` suffix access for each documentation page
3. Add UI dropdown for markdown access/copy
4. Inject `<link rel="alternate">` tags in HTML headers for AI discovery
5. Add LLM section to sidebar menu

## Architecture

### Plugin Selection

| Plugin | Version | Purpose |
|--------|---------|---------|
| `docusaurus-plugin-llms` | 0.4.0 | Generate llms.txt / llms-full.txt |
| `docusaurus-markdown-source-plugin` | 2.2.5 | .md suffix access + UI dropdown |

### File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `website/package.json` | Modify | Add 2 plugin dependencies |
| `website/docusaurus.config.ts` | Modify | Add plugins and headTags |
| `website/sidebars.ts` | Modify | Add LLM category |
| `website/src/theme/Root.tsx` | Create | Inject per-page .md link |
| `website/src/css/custom.css` | Modify | Add dropdown styles |

## Implementation Details

### 1. Plugin Configuration

```typescript
// docusaurus.config.ts
plugins: [
  [
    'docusaurus-plugin-llms',
    {
      generateLLMsTxt: true,
      generateLLMsFullTxt: true,
      docsDir: 'docs',
      title: 'Zelt Documentation',
      description: 'A fast, type-safe application framework for TypeScript',
    },
  ],
  'docusaurus-markdown-source-plugin',
],
```

### 2. HTML Head Tags (Site-wide)

```typescript
// docusaurus.config.ts
headTags: [
  // ... existing font tags ...
  {
    tagName: 'link',
    attributes: {
      rel: 'alternate',
      type: 'text/markdown',
      href: '/llms.txt',
      title: 'LLM Documentation Index',
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'alternate',
      type: 'text/markdown',
      href: '/llms-full.txt',
      title: 'LLM Full Documentation',
    },
  },
],
```

### 3. Per-Page Markdown Link (Custom Root)

```typescript
// src/theme/Root.tsx
import React from 'react';
import Head from '@docusaurus/Head';
import { useLocation } from '@docusaurus/router';

const Root = ({ children }: { children: React.ReactNode }): React.JSX.Element => {
  const location = useLocation();
  const mdUrl = `${location.pathname}.md`;

  return (
    <>
      <Head>
        <link rel="alternate" type="text/markdown" href={mdUrl} title="Markdown version" />
      </Head>
      {children}
    </>
  );
};

export default Root;
```

### 4. Sidebar Configuration

```typescript
// sidebars.ts
{
  type: 'category',
  label: 'LLM',
  collapsed: true,
  items: [
    {
      type: 'link',
      label: 'llms.txt',
      href: '/llms.txt',
    },
    {
      type: 'link',
      label: 'llms-full.txt',
      href: '/llms-full.txt',
    },
  ],
},
```

### 5. CSS Styles

```css
/* src/css/custom.css */
article .markdown header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

article .markdown header h1 {
  flex: 1 1 auto;
  margin: 0;
}

.markdown-actions-container {
  flex-shrink: 0;
  margin-left: auto;
}
```

## AI Discovery Flow

```
AI visits HTML page
    ↓
Reads <head> section
    ↓
Finds <link rel="alternate" type="text/markdown" href="...">
    ↓
Options:
  - /llms.txt → Documentation index with links
  - /llms-full.txt → Full documentation in single file
  - /current-page.md → Current page as markdown
```

## Testing

1. Build website: `pnpm --filter website build`
2. Serve locally: `pnpm --filter website serve`
3. Verify:
   - `/llms.txt` returns documentation index
   - `/llms-full.txt` returns full documentation
   - Any doc page with `.md` suffix returns markdown
   - HTML source contains `<link rel="alternate">` tags
   - Sidebar shows LLM category
   - UI dropdown appears on doc pages

## Dependencies

```json
{
  "docusaurus-plugin-llms": "0.4.0",
  "docusaurus-markdown-source-plugin": "2.2.5"
}
```
