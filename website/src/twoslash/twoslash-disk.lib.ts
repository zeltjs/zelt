import type { CreateTwoslashOptions } from 'twoslash';
import ts from 'typescript';

const cached = <R>(read: (file: string) => R): ((file: string) => R) => {
  const results = new Map<string, { readonly value: R }>();
  return (file) => {
    const hit = results.get(file);
    if (hit) return hit.value;
    const value = read(file);
    results.set(file, { value });
    return value;
  };
};

// Disk reads are shared for one build or verification run. Each snippet has a fresh VFS.
export const createTwoslashDiskOptions = () => {
  const readCachedFile = cached((file) => ts.sys.readFile(file));
  const diskSystem: ts.System = {
    ...ts.sys,
    fileExists: cached((file) => ts.sys.fileExists(file)),
    directoryExists: cached((file) => ts.sys.directoryExists(file)),
    readFile: (file, encoding) =>
      encoding === undefined ? readCachedFile(file) : ts.sys.readFile(file, encoding),
    ...(ts.sys.realpath ? { realpath: cached((file) => ts.sys.realpath?.(file) ?? file) } : {}),
  };

  // Parsed files are shared only at version "0": @typescript/vfs gives that version to every file a
  // snippet did not write, which therefore comes from disk. A snippet's own files get later versions
  // and stay in the registry of that snippet's language service.
  const diskDocuments = ts.createDocumentRegistry();
  const snippetDocuments = (): ts.DocumentRegistry => {
    const own = ts.createDocumentRegistry();
    const owned = new Set<string>();
    const pick = (id: string, version: string): ts.DocumentRegistry => {
      if (version === '0') return diskDocuments;
      owned.add(id);
      return own;
    };
    const holder = (id: string): ts.DocumentRegistry => (owned.has(id) ? own : diskDocuments);
    const withKey = (path: ts.Path, key: ts.DocumentRegistryBucketKey) => `${key}\0${path}`;
    return {
      acquireDocument: (fileName, settings, snapshot, version, ...rest) =>
        pick(fileName, version).acquireDocument(fileName, settings, snapshot, version, ...rest),
      acquireDocumentWithKey: (fileName, path, settings, key, snapshot, version, ...rest) =>
        pick(withKey(path, key), version).acquireDocumentWithKey(
          fileName,
          path,
          settings,
          key,
          snapshot,
          version,
          ...rest,
        ),
      updateDocument: (fileName, settings, snapshot, version, ...rest) =>
        pick(fileName, version).updateDocument(fileName, settings, snapshot, version, ...rest),
      updateDocumentWithKey: (fileName, path, settings, key, snapshot, version, ...rest) =>
        pick(withKey(path, key), version).updateDocumentWithKey(
          fileName,
          path,
          settings,
          key,
          snapshot,
          version,
          ...rest,
        ),
      getKeyForCompilationSettings: (settings) => own.getKeyForCompilationSettings(settings),
      releaseDocument: (
        fileName: string,
        settings: ts.CompilerOptions,
        scriptKind?: ts.ScriptKind,
        impliedNodeFormat?: ts.ResolutionMode,
      ) => {
        const registry = holder(fileName);
        if (scriptKind === undefined) registry.releaseDocument(fileName, settings);
        else registry.releaseDocument(fileName, settings, scriptKind, impliedNodeFormat);
      },
      releaseDocumentWithKey: (
        path: ts.Path,
        key: ts.DocumentRegistryBucketKey,
        scriptKind?: ts.ScriptKind,
        impliedNodeFormat?: ts.ResolutionMode,
      ) => {
        const registry = holder(withKey(path, key));
        if (scriptKind === undefined) registry.releaseDocumentWithKey(path, key);
        else registry.releaseDocumentWithKey(path, key, scriptKind, impliedNodeFormat);
      },
      reportStats: () => own.reportStats(),
    };
  };

  return {
    tsModule: {
      ...ts,
      sys: diskSystem,
      createLanguageService: (host, registry, mode) =>
        ts.createLanguageService(host, registry ?? snippetDocuments(), mode),
    } satisfies typeof ts,
    fsCache: false,
  } satisfies CreateTwoslashOptions;
};
