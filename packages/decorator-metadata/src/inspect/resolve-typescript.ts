type TypeScriptModule = typeof import('typescript');

let cachedTs: TypeScriptModule | undefined;

export const resolveTypeScript = async (): Promise<TypeScriptModule> => {
  if (cachedTs) return cachedTs;

  const userTs: TypeScriptModule = await import('typescript');
  const major = parseInt(userTs.version.split('.')[0] ?? '0', 10);

  if (major >= 7) {
    throw new Error(
      `TypeScript ${userTs.version} is not yet supported. ` +
        `TypeScript 7 requires Corsa API which is not available. ` +
        `Please use TypeScript 5.x or 6.x.`,
    );
  }

  cachedTs = userTs;
  return cachedTs;
};
