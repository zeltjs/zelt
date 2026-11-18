import { codeFences } from './code-fences.lib';

const visibleCode = (code: string): string => code.split(/\/\/ ---cut---\r?\n/).at(-1) ?? code;

// The guide's schema and generated excerpt stay authoritative for every isolated block.
export const graphqlDrizzleSetup = (
  markdown: string,
  databaseService: string,
): Readonly<Record<string, string>> => {
  const blocks = codeFences(markdown, 'ts').map(visibleCode);
  const block = (marker: string): string => {
    const found = blocks.find((code) => code.includes(marker));
    if (found === undefined) throw new Error(`GraphQL Drizzle guide is missing ${marker}`);
    return found;
  };
  const appImports = `import { graphql } from '@zeltjs/graphql';
import { UserResolver } from './graphql/user.resolver';
import { PostResolver } from './graphql/post.resolver';
`;
  return {
    'graphql-drizzle/src/db/schema.ts': block('// src/db/schema.ts'),
    'graphql-drizzle/src/db/drizzle.service.ts': databaseService,
    'graphql-drizzle/src/generated/drizzle-graphql.ts': `import type { ID } from '@zeltjs/graphql';
import { users, posts } from '../db/schema';
${block('// src/generated/drizzle-graphql.ts')}`,
    'graphql-drizzle/src/graphql/user.resolver.ts': block('// src/graphql/user.resolver.ts'),
    'graphql-drizzle/src/graphql/post.resolver.ts': block('// src/graphql/post.resolver.ts'),
    'graphql-drizzle/src/app.ts': `${appImports}import { createApp, http } from '@zeltjs/core';
const endpoint = ${block('// src/app.ts')}
export const app = createApp([http({ children: [endpoint] })]);
`,
  };
};
