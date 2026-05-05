import fg from 'fast-glob';
import { type Project } from 'ts-morph';

import type { ControllerSpec } from './internal-representation';
import { extractControllerDecorator } from './decorator';

export const discoverControllers = (
  project: Project,
  patterns: readonly string[],
): readonly ControllerSpec[] => {
  const files = fg.sync([...patterns], { absolute: true });
  const specs: ControllerSpec[] = [];

  for (const filePath of files) {
    project.addSourceFileAtPath(filePath);
    const sf = project.getSourceFile(filePath);
    if (!sf) continue;

    for (const cls of sf.getClasses()) {
      const ctrl = extractControllerDecorator(cls);
      if (!ctrl) continue;

      const exportName = cls.getName();
      if (!exportName) continue;

      const isExported = cls.isExported();
      if (!isExported) continue;

      specs.push({ filePath, exportName });
    }
  }

  project.resolveSourceFileDependencies();
  return specs;
};
