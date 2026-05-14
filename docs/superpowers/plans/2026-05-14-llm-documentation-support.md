# LLM Documentation Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable AI assistants to efficiently consume Zelt documentation via llms.txt, llms-full.txt, per-page .md access, and HTML header discovery.

**Architecture:** Two Docusaurus plugins handle generation (docusaurus-plugin-llms for llms.txt files, docusaurus-markdown-source-plugin for .md routes). Custom Root theme injects per-page `<link rel="alternate">` tags for AI discovery.

**Tech Stack:** Docusaurus 3.10.1, docusaurus-plugin-llms 0.4.0, docusaurus-markdown-source-plugin 2.2.5, React, TypeScript

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `website/package.json` | Modify | Add plugin dependencies |
| `website/docusaurus.config.ts` | Modify | Register plugins, add headTags |
| `website/sidebars.ts` | Modify | Add LLM category to sidebar |
| `website/src/theme/Root.tsx` | Create | Inject per-page .md link tag |
| `website/src/css/custom.css` | Modify | Add markdown dropdown styles |

---

### Task 1: Add Plugin Dependencies

**Files:**
- Modify: `website/package.json:17-29`

- [ ] **Step 1: Add dependencies to package.json**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm add docusaurus-plugin-llms@0.4.0 docusaurus-markdown-source-plugin@2.2.5
```

- [ ] **Step 2: Verify dependencies are installed**

Run: `cat /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/package.json | grep -A2 "docusaurus-plugin-llms\|docusaurus-markdown-source-plugin"`

Expected output:
```
    "docusaurus-plugin-llms": "0.4.0",
    "docusaurus-markdown-source-plugin": "2.2.5",
```

- [ ] **Step 3: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/package.json website/pnpm-lock.yaml && git commit -m "$(cat <<'EOF'
feat(website): add LLM documentation plugins

Add docusaurus-plugin-llms and docusaurus-markdown-source-plugin
for llms.txt generation and per-page markdown access.
EOF
)"
```

---

### Task 2: Configure Plugins in Docusaurus

**Files:**
- Modify: `website/docusaurus.config.ts:76-87`

- [ ] **Step 1: Add plugin configurations**

In `website/docusaurus.config.ts`, add to the `plugins` array (after the existing examples plugin):

```typescript
plugins: [
  [
    '@docusaurus/plugin-content-docs',
    {
      id: 'examples',
      path: 'examples',
      routeBasePath: 'examples',
      sidebarPath: './sidebars-examples.ts',
      editUrl: 'https://github.com/zeltjs/zelt/tree/main/website/',
    },
  ],
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

- [ ] **Step 2: Verify syntax by running typecheck**

Run: `cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/docusaurus.config.ts && git commit -m "$(cat <<'EOF'
feat(website): configure LLM documentation plugins

Register docusaurus-plugin-llms with llms.txt/llms-full.txt generation
and docusaurus-markdown-source-plugin for .md suffix access.
EOF
)"
```

---

### Task 3: Add Site-Wide Head Tags

**Files:**
- Modify: `website/docusaurus.config.ts:34-57`

- [ ] **Step 1: Add LLM link tags to headTags array**

In `website/docusaurus.config.ts`, add to the end of the `headTags` array:

```typescript
headTags: [
  {
    tagName: 'link',
    attributes: {
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com',
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossorigin: 'anonymous',
    },
  },
  {
    tagName: 'link',
    attributes: {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap',
    },
  },
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

- [ ] **Step 2: Verify syntax by running typecheck**

Run: `cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/docusaurus.config.ts && git commit -m "$(cat <<'EOF'
feat(website): add LLM discovery link tags to HTML head

Add <link rel="alternate"> tags for llms.txt and llms-full.txt
to enable AI assistants to discover LLM-friendly documentation.
EOF
)"
```

---

### Task 4: Add LLM Category to Sidebar

**Files:**
- Modify: `website/sidebars.ts:78-83`

- [ ] **Step 1: Add LLM category before Examples link**

In `website/sidebars.ts`, add a new category before the Examples link:

```typescript
const sidebars: SidebarsConfig = {
  docsSidebar: [
    'introduction',
    // ... existing categories ...
    {
      type: 'category',
      label: 'Integrations',
      collapsed: false,
      items: ['hono-client', 'openapi', 'bullmq'],
    },
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
    {
      type: 'link',
      label: 'Examples',
      href: '/examples/drizzle-todo',
    },
  ],
};
```

- [ ] **Step 2: Verify syntax by running typecheck**

Run: `cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/sidebars.ts && git commit -m "$(cat <<'EOF'
feat(website): add LLM section to documentation sidebar

Add collapsed LLM category with links to llms.txt and llms-full.txt
for easy access from the documentation navigation.
EOF
)"
```

---

### Task 5: Create Custom Root Theme for Per-Page MD Links

**Files:**
- Create: `website/src/theme/Root.tsx`

- [ ] **Step 1: Create Root.tsx file**

Create `website/src/theme/Root.tsx`:

```typescript
import Head from '@docusaurus/Head';
import { useLocation } from '@docusaurus/router';
import type { ReactNode } from 'react';

type RootProps = {
  children: ReactNode;
};

const Root = ({ children }: RootProps): ReactNode => {
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

- [ ] **Step 2: Verify syntax by running typecheck**

Run: `cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm typecheck`

Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/src/theme/Root.tsx && git commit -m "$(cat <<'EOF'
feat(website): add per-page markdown link to HTML head

Custom Root theme component injects <link rel="alternate"> tag
pointing to the .md version of each page for AI discovery.
EOF
)"
```

---

### Task 6: Add Markdown Dropdown CSS Styles

**Files:**
- Modify: `website/src/css/custom.css:265`

- [ ] **Step 1: Add markdown actions styles at end of custom.css**

Append to `website/src/css/custom.css`:

```css

/* ===== Markdown Actions Dropdown ===== */

article .markdown header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  overflow: visible;
}

article .markdown header h1 {
  flex: 1 1 auto;
  margin: 0;
}

.markdown-actions-container {
  flex-shrink: 0;
  margin-left: auto;
  position: relative;
}

.markdown-actions-container .dropdown {
  position: relative;
}

.markdown-actions-container .dropdown__menu {
  z-index: 1000;
  min-width: 220px;
  right: auto;
  left: 0;
}

.dropdown__link:hover {
  background-color: var(--ifm-hover-overlay);
}

@media (max-width: 768px) {
  .markdown-actions-container {
    margin-right: clamp(0px, 0.5rem, 1rem);
    margin-bottom: 1rem;
  }

  .markdown-actions-container .button {
    font-size: 0.875rem;
    padding: 0.375rem 0.75rem;
  }

  .markdown-actions-container .dropdown__menu {
    right: 0;
    left: auto;
    min-width: min(220px, calc(100vw - 2rem));
    max-width: calc(100vw - 2rem);
    padding-bottom: 0.75rem;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support && git add website/src/css/custom.css && git commit -m "$(cat <<'EOF'
feat(website): add markdown dropdown styles

Style the Open Markdown dropdown from docusaurus-markdown-source-plugin
for consistent appearance with the site theme.
EOF
)"
```

---

### Task 7: Build and Verify

**Files:**
- None (verification only)

- [ ] **Step 1: Build the website**

Run: `cd /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website && pnpm build`

Expected: Build succeeds with llms.txt and llms-full.txt generated

- [ ] **Step 2: Verify llms.txt was generated**

Run: `cat /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/build/llms.txt | head -20`

Expected: File exists with documentation links

- [ ] **Step 3: Verify llms-full.txt was generated**

Run: `ls -la /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/build/llms-full.txt`

Expected: File exists

- [ ] **Step 4: Verify .md files were generated**

Run: `ls /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/build/*.md 2>/dev/null | head -5 || ls /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/build/**/*.md 2>/dev/null | head -5`

Expected: .md files exist in build directory

- [ ] **Step 5: Verify HTML contains link tags**

Run: `grep -o '<link[^>]*alternate[^>]*markdown[^>]*>' /workspaces/github.com/zeltjs/zelt=feat-llm-documentation-support/website/build/index.html | head -3`

Expected: Link tags for llms.txt, llms-full.txt, and .md version
