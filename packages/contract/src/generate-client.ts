// packages/contract/src/generate-client.ts
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { errAsync, ResultAsync } from 'neverthrow';

import type { ContractError } from './errors';
import { discoverControllers } from './analyzer/discover-controllers';
import { analyzeControllers } from './analyzer/internal-representation';
import { createProject } from './analyzer/project';
import type { GenerateClientOptions } from './config/options';
import { emitAppGen } from './emit/app-gen';
import { emitOpenApi } from './emit/openapi';

const writeIfChanged = async (path: string, content: string): Promise<boolean> => {
  if (existsSync(path)) {
    const existing = await readFile(path, 'utf8');
    if (existing === content) return false;
  }
  await writeFile(path, content, 'utf8');
  return true;
};

export type GenerateClientResult = {
  readonly appGenChanged: boolean;
  readonly openApiChanged: boolean;
};

export const generateClient = (
  options: GenerateClientOptions,
): ResultAsync<GenerateClientResult, ContractError> => {
  const distDir = resolve(options.dist);
  const tsconfigPath = options.tsconfig ? resolve(options.tsconfig) : resolve('tsconfig.json');

  const project = createProject({ tsConfigFilePath: tsconfigPath, controllerFiles: [] });
  const specs = discoverControllers(project, options.controllers);

  const irResult = analyzeControllers(project, specs);
  if (irResult.isErr()) {
    return errAsync(irResult.error);
  }
  const ir = irResult.value;

  const emitOptions = options.requestValidator
    ? { distDir, tsconfigPath, requestValidator: options.requestValidator }
    : { distDir, tsconfigPath };

  return ResultAsync.fromPromise(mkdir(distDir, { recursive: true }), () => ({
    type: 'CONFIG_NOT_FOUND' as const,
  }))
    .andThen(() => emitOpenApi(ir, emitOptions))
    .andThen((openApiDoc) => {
      const appGenContent = emitAppGen(ir, { distDir });
      const appGenPath = resolve(distDir, 'app.gen.ts');
      const openApiContent = `${JSON.stringify(openApiDoc, null, 2)}\n`;
      const openApiPath = resolve(distDir, 'openapi.json');

      return ResultAsync.fromPromise(
        Promise.all([
          writeIfChanged(appGenPath, appGenContent),
          writeIfChanged(openApiPath, openApiContent),
        ]),
        () => ({ type: 'CONFIG_NOT_FOUND' as const }),
      ).map(([appGenChanged, openApiChanged]) => ({ appGenChanged, openApiChanged }));
    });
};
