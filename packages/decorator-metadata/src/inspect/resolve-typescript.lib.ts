type TypeScriptModule = typeof import('typescript');

export class UnsupportedTypeScriptVersionError extends Error {
  override readonly name = 'UnsupportedTypeScriptVersionError';
  constructor(
    public readonly context: {
      currentVersion: string;
      supportedVersions: string;
    },
  ) {
    super(
      `TypeScript ${context.currentVersion} is not supported. Supported versions: ${context.supportedVersions}`,
    );
  }
}

let cachedTs: TypeScriptModule | undefined;

/** @throws {UnsupportedTypeScriptVersionError} */
export const resolveTypeScript = async (): Promise<TypeScriptModule> => {
  if (cachedTs) return cachedTs;

  const userTs: TypeScriptModule = await import('typescript');
  const major = parseInt(userTs.version.split('.')[0] ?? '0', 10);

  if (major >= 7) {
    throw new UnsupportedTypeScriptVersionError({
      currentVersion: userTs.version,
      supportedVersions: '5.x or 6.x',
    });
  }

  cachedTs = userTs;
  return cachedTs;
};
