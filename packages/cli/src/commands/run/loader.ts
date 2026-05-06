import { pathToFileURL } from 'node:url';

import { getCommandMetadata, type CommandClass } from '@zeltjs/command';
import { glob } from 'tinyglobby';

export const loadCommands = async (
  cwd: string,
  pattern: string,
): Promise<Map<string, CommandClass>> => {
  const files = await glob(pattern, { cwd, absolute: true });
  const commandMap = new Map<string, CommandClass>();

  for (const file of files) {
    const fileUrl = pathToFileURL(file).href;
    const module = (await import(fileUrl)) as Record<string, unknown>;

    for (const exportValue of Object.values(module)) {
      if (typeof exportValue === 'function') {
        const meta = getCommandMetadata(exportValue);
        if (meta) {
          commandMap.set(meta.name, exportValue as CommandClass);
        }
      }
    }
  }

  return commandMap;
};
