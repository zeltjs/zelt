import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

export const generateClient = async (
  options: GenerateClientOptions,
): Promise<GenerateClientResult> => {
  const distDir = resolve(options.dist);
  const tsconfigPath = options.tsconfig ? resolve(options.tsconfig) : resolve('tsconfig.json');

  await mkdir(distDir, { recursive: true });

  const project = createProject({ tsConfigFilePath: tsconfigPath, controllerFiles: [] });
  const specs = discoverControllers(project, options.controllers);
  const ir = analyzeControllers(project, specs);

  const appGenContent = emitAppGen(ir, { distDir });
  const appGenPath = resolve(distDir, 'app.gen.ts');
  const appGenChanged = await writeIfChanged(appGenPath, appGenContent);

  const openApiDoc = await emitOpenApi(ir, { distDir, tsconfigPath });
  const openApiContent = `${JSON.stringify(openApiDoc, null, 2)}\n`;
  const openApiPath = resolve(distDir, 'openapi.json');
  const openApiChanged = await writeIfChanged(openApiPath, openApiContent);

  return { appGenChanged, openApiChanged };
};
