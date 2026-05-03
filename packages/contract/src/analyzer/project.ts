import { ModuleKind, ModuleResolutionKind, Project, ScriptTarget } from 'ts-morph';

type CreateProjectOptions = {
  readonly tsConfigFilePath?: string;
  readonly controllerFiles: readonly string[];
};

// tsconfig が指定されていればそれを使い、なければ in-memory project を controllerFiles で構築。
// tsconfig 経由なら moduleResolution / paths が解決され、@koya/core の symbol も追える。
export const createProject = (options: CreateProjectOptions): Project => {
  const project =
    options.tsConfigFilePath === undefined
      ? new Project({
          compilerOptions: {
            target: ScriptTarget.ES2022,
            module: ModuleKind.ESNext,
            moduleResolution: ModuleResolutionKind.Bundler,
            experimentalDecorators: true,
            strict: true,
          },
        })
      : new Project({ tsConfigFilePath: options.tsConfigFilePath });

  for (const f of options.controllerFiles) {
    project.addSourceFileAtPath(f);
  }
  project.resolveSourceFileDependencies();
  return project;
};
