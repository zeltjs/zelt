import { dirname, isAbsolute, resolve } from 'node:path';

import { Injectable } from '@zeltjs/core';

type TypeScriptModule = typeof import('typescript');
type TSCompilerOptions = Parameters<TypeScriptModule['createCompilerHost']>[0];
type TSProgram = import('typescript').Program;
type TSSourceFile = import('typescript').SourceFile;
type TSTypeFormatFlags = import('typescript').TypeFormatFlags;

export type ResolveError =
  | { kind: 'type_not_found'; readonly typeName: string }
  | { kind: 'program_creation_failed'; readonly message: string }
  | { kind: 'type_resolution_failed'; readonly message: string }
  | { kind: 'local_reference_leaked'; readonly reference: string };

type ResolveResult<T> =
  | { ok: true; readonly value: T }
  | { ok: false; readonly error: ResolveError };

type LocalTypeDeclaration =
  | import('typescript').TypeAliasDeclaration
  | import('typescript').InterfaceDeclaration;

type CreateVirtualProgramResult = {
  readonly program: TSProgram;
  readonly checker: import('typescript').TypeChecker;
  readonly sourceFile: TSSourceFile;
};

export type ResolveAppTypeResult = {
  readonly portableOutput: string;
};

type ResolvedHonoArguments = {
  readonly appTypeAlias: import('typescript').TypeAliasDeclaration;
  readonly envType: import('typescript').Type;
  readonly schemaType: import('typescript').Type;
  readonly basePathType: import('typescript').Type;
};

type TypeWithArguments = import('typescript').Type & {
  readonly typeArguments?: readonly import('typescript').Type[];
};

type RenderedHonoTypes = {
  readonly envText: string;
  readonly schemaText: string;
  readonly basePathText: string;
};

@Injectable()
export class AppTypeResolverService {
  private readonly externalModuleRewrites: readonly [test: string, specifier: string][] = [
    ['/hono/dist/types/types', 'hono/types'],
    ['/hono/dist/types/hono', 'hono'],
    ['/hono/dist/types/utils/http-status', 'hono/utils/http-status'],
    ['/@zeltjs/core/dist/index', '@zeltjs/core'],
    ['/@zeltjs/hono-client/dist/index', '@zeltjs/hono-client'],
  ];

  resolve(
    sourceText: string,
    compilerOptions: TSCompilerOptions,
    originalFileNames: readonly string[],
    ts: TypeScriptModule,
    projectRoot: string,
    virtualDir: string,
  ): ResolveResult<ResolveAppTypeResult> {
    try {
      return this.resolveUnsafe(
        sourceText,
        compilerOptions,
        originalFileNames,
        ts,
        projectRoot,
        virtualDir,
      );
    } catch (error) {
      return this.typeResolutionError(this.errorMessage(error));
    }
  }

  private resolveUnsafe(
    sourceText: string,
    compilerOptions: TSCompilerOptions,
    originalFileNames: readonly string[],
    ts: TypeScriptModule,
    projectRoot: string,
    virtualDir: string,
  ): ResolveResult<ResolveAppTypeResult> {
    const virtualFileName = resolve(virtualDir, '__portable_resolve.ts');
    const virtualContainingDir = dirname(virtualFileName);

    const programResult = this.createVirtualProgram(
      virtualFileName,
      sourceText,
      originalFileNames,
      compilerOptions,
      ts,
    );
    if (!programResult.ok) return programResult;

    return this.resolveFromProgram(programResult.value, ts, projectRoot, virtualContainingDir);
  }

  private resolveFromProgram(
    context: CreateVirtualProgramResult,
    ts: TypeScriptModule,
    projectRoot: string,
    containingDir: string,
  ): ResolveResult<ResolveAppTypeResult> {
    const aliasResult = this.findAppTypeAlias(context.sourceFile, ts);
    if (!aliasResult.ok) return aliasResult;

    const typeResult = this.resolveHonoArguments(context.checker, aliasResult.value);
    if (!typeResult.ok) return typeResult;

    const renderedResult = this.renderHonoTypes(
      context,
      typeResult.value,
      projectRoot,
      containingDir,
      ts,
    );
    if (!renderedResult.ok) return renderedResult;

    const { envText, schemaText, basePathText } = renderedResult.value;
    const output = this.buildPortableOutput(envText, schemaText, basePathText);
    const safetyCheck = this.assertNoLocalReferences(output, projectRoot);
    if (!safetyCheck.ok) return safetyCheck;

    return { ok: true, value: { portableOutput: output } };
  }

  private externalModuleSpecifier(absoluteModulePath: string): string | undefined {
    for (const [test, specifier] of this.externalModuleRewrites) {
      if (absoluteModulePath.includes(test)) return specifier;
    }
    return undefined;
  }

  private normalizeExternalImportReferences(source: string): string {
    return source.replace(
      /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g,
      (matched: string, modulePath: string, exportName: string) => {
        const external = this.externalModuleSpecifier(modulePath);
        if (!external) return matched;
        return `import('${external}').${exportName}`;
      },
    );
  }

  private getSourceFileForImport(program: TSProgram, modulePath: string): TSSourceFile | undefined {
    const candidates = [
      modulePath,
      `${modulePath}.ts`,
      `${modulePath}.tsx`,
      `${modulePath}.d.ts`,
      `${modulePath}/index.ts`,
      `${modulePath}/index.tsx`,
      `${modulePath}/index.d.ts`,
    ];
    return candidates.map((candidate) => program.getSourceFile(candidate)).find(Boolean);
  }

  private printNode(
    node: import('typescript').Node,
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): string {
    return ts
      .createPrinter({ newLine: ts.NewLineKind.LineFeed })
      .printNode(ts.EmitHint.Unspecified, node, sourceFile);
  }

  private findLocalTypeDeclaration(
    sourceFile: TSSourceFile,
    exportName: string,
    ts: TypeScriptModule,
  ): LocalTypeDeclaration | undefined {
    for (const stmt of sourceFile.statements) {
      if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === exportName) return stmt;
      if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === exportName) return stmt;
    }
    return undefined;
  }

  private hasLocalTypeDeclaration(
    sourceFile: TSSourceFile,
    typeName: string,
    ts: TypeScriptModule,
  ): boolean {
    return this.findLocalTypeDeclaration(sourceFile, typeName, ts) !== undefined;
  }

  private createLocalImportTypeNode(
    sourceFile: TSSourceFile,
    typeName: string,
    typeArguments: import('typescript').NodeArray<import('typescript').TypeNode> | undefined,
    ts: TypeScriptModule,
  ): import('typescript').ImportTypeNode {
    return ts.factory.createImportTypeNode(
      ts.factory.createLiteralTypeNode(ts.factory.createStringLiteral(sourceFile.fileName)),
      undefined,
      ts.factory.createIdentifier(typeName),
      typeArguments,
      false,
    );
  }

  private printNodeWithLocalTypeImports(
    node: import('typescript').Node,
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): string {
    const transformed = ts.transform(node, [
      (context) => (root) => ts.visitNode(root, this.localImportVisitor(context, sourceFile, ts)),
    ]);
    const transformedNode = transformed.transformed[0];
    if (!transformedNode) {
      transformed.dispose();
      return this.printNode(node, sourceFile, ts);
    }
    const result = this.printNode(transformedNode, sourceFile, ts);
    transformed.dispose();
    return result;
  }

  private localImportVisitor(
    context: import('typescript').TransformationContext,
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): (child: import('typescript').Node) => import('typescript').Node {
    const visit = (child: import('typescript').Node): import('typescript').Node => {
      if (
        ts.isTypeReferenceNode(child) &&
        ts.isIdentifier(child.typeName) &&
        this.hasLocalTypeDeclaration(sourceFile, child.typeName.text, ts)
      ) {
        return this.createLocalImportTypeNode(
          sourceFile,
          child.typeName.text,
          child.typeArguments,
          ts,
        );
      }
      return ts.visitEachChild(child, visit, context);
    };
    return visit;
  }

  private renderInterfaceExpression(
    declaration: import('typescript').InterfaceDeclaration,
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): string {
    const typeLiteral = ts.factory.createTypeLiteralNode(declaration.members);
    return this.printNodeWithLocalTypeImports(typeLiteral, sourceFile, ts);
  }

  private findLocalTypeExpression(
    program: TSProgram,
    modulePath: string,
    exportName: string,
    ts: TypeScriptModule,
  ): string | undefined {
    const sourceFile = this.getSourceFileForImport(program, modulePath);
    if (!sourceFile) return undefined;
    const declaration = this.findLocalTypeDeclaration(sourceFile, exportName, ts);
    if (!declaration) return undefined;
    if (ts.isTypeAliasDeclaration(declaration)) {
      return this.printNodeWithLocalTypeImports(declaration.type, sourceFile, ts);
    }
    return this.renderInterfaceExpression(declaration, sourceFile, ts);
  }

  private resolveModulePath(modulePath: string, containingDir: string): string {
    return modulePath.startsWith('.') ? resolve(containingDir, modulePath) : modulePath;
  }

  private normalizeProjectRoot(projectRoot: string): string {
    const normalized = resolve(projectRoot);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private isInsideProjectRoot(
    modulePath: string,
    projectRoot: string,
    containingDir: string,
  ): boolean {
    const resolvedPath = this.resolveModulePath(modulePath, containingDir);
    if (!isAbsolute(resolvedPath)) return false;
    if (resolvedPath.includes('/node_modules/')) return false;
    return resolve(resolvedPath).startsWith(this.normalizeProjectRoot(projectRoot));
  }

  private getLocalModulePath(
    modulePath: string,
    projectRoot: string,
    containingDir: string,
  ): string | undefined {
    const resolvedPath = this.resolveModulePath(modulePath, containingDir);
    if (modulePath.includes('/node_modules/')) return undefined;
    if (!this.isInsideProjectRoot(modulePath, projectRoot, containingDir)) return undefined;
    return resolvedPath;
  }

  private inlineLocalImportReferences(
    program: TSProgram,
    source: string,
    projectRoot: string,
    ts: TypeScriptModule,
    containingDir: string,
  ): ResolveResult<string> {
    let current = source;
    for (let i = 0; i < 20; i += 1) {
      const next = this.replaceLocalImportReferences(
        program,
        current,
        projectRoot,
        ts,
        containingDir,
      );
      if (next === current) return { ok: true, value: current };
      current = next;
    }
    return this.typeResolutionError(
      'Local type reference expansion did not converge within iteration limit',
    );
  }

  private replaceLocalImportReferences(
    program: TSProgram,
    source: string,
    projectRoot: string,
    ts: TypeScriptModule,
    containingDir: string,
  ): string {
    return source.replace(
      /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g,
      (matched: string, modulePath: string, exportName: string) => {
        if (!this.isInsideProjectRoot(modulePath, projectRoot, containingDir)) return matched;
        const localModulePath = this.getLocalModulePath(modulePath, projectRoot, containingDir);
        if (!localModulePath) return matched;
        const expression = this.findLocalTypeExpression(program, localModulePath, exportName, ts);
        if (!expression) return matched;
        return `(${expression})`;
      },
    );
  }

  private assertNoLocalReferences(source: string, projectRoot: string): ResolveResult<void> {
    const relativeReference = /import\(['"](\.{1,2}\/[^'"]+)['"]\)/.exec(source)?.[1];
    if (relativeReference) {
      return {
        ok: false,
        error: { kind: 'local_reference_leaked', reference: relativeReference },
      };
    }
    if (!source.includes(projectRoot)) return { ok: true, value: undefined };
    return { ok: false, error: { kind: 'local_reference_leaked', reference: projectRoot } };
  }

  private normalizeLintSensitiveTypeText(source: string): string {
    return source.replace(
      /\breadonly\s+([A-Za-z_$][\w$]*):\s+(true|false|null|undefined|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*");/g,
      '$1: $2;',
    );
  }

  private createVirtualCompilerHost(
    virtualFileName: string,
    virtualContent: string,
    compilerOptions: TSCompilerOptions,
    ts: TypeScriptModule,
  ): import('typescript').CompilerHost {
    const baseHost = ts.createCompilerHost(compilerOptions);
    const virtualSourceFile = ts.createSourceFile(
      virtualFileName,
      virtualContent,
      ts.ScriptTarget.Latest,
      true,
    );

    return {
      ...baseHost,
      getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
        if (fileName === virtualFileName) return virtualSourceFile;
        return baseHost.getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );
      },
      fileExists(fileName) {
        if (fileName === virtualFileName) return true;
        return baseHost.fileExists(fileName);
      },
      readFile(fileName) {
        if (fileName === virtualFileName) return virtualContent;
        return baseHost.readFile(fileName);
      },
    };
  }

  private portableCompilerOptions(compilerOptions: TSCompilerOptions): TSCompilerOptions {
    const opts = { ...compilerOptions };
    delete opts.rootDir;
    delete opts.composite;
    delete opts.declaration;
    delete opts.declarationMap;
    delete opts.tsBuildInfoFile;
    return opts;
  }

  private createVirtualProgram(
    virtualFileName: string,
    virtualContent: string,
    originalFileNames: readonly string[],
    compilerOptions: TSCompilerOptions,
    ts: TypeScriptModule,
  ): ResolveResult<CreateVirtualProgramResult> {
    const program = ts.createProgram({
      rootNames: [...new Set([...originalFileNames, virtualFileName])],
      options: this.portableCompilerOptions(compilerOptions),
      host: this.createVirtualCompilerHost(virtualFileName, virtualContent, compilerOptions, ts),
    });

    const sf = program.getSourceFile(virtualFileName);
    if (!sf)
      return this.programCreationError(`Failed to load virtual source file: ${virtualFileName}`);

    return { ok: true, value: { program, checker: program.getTypeChecker(), sourceFile: sf } };
  }

  private findAppTypeAlias(
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): ResolveResult<import('typescript').TypeAliasDeclaration> {
    let appTypeAlias: import('typescript').TypeAliasDeclaration | undefined;
    ts.forEachChild(sourceFile, (node) => {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === 'AppType') {
        appTypeAlias = node;
      }
    });
    if (appTypeAlias) return { ok: true, value: appTypeAlias };
    return { ok: false, error: { kind: 'type_not_found', typeName: 'AppType' } };
  }

  private resolveHonoArguments(
    checker: import('typescript').TypeChecker,
    appTypeAlias: import('typescript').TypeAliasDeclaration,
  ): ResolveResult<ResolvedHonoArguments> {
    const appTypeSymbol = checker.getSymbolAtLocation(appTypeAlias.name);
    if (!appTypeSymbol) return this.typeResolutionError('AppType symbol was not resolved');

    const appTypeWithArguments: TypeWithArguments = checker.getDeclaredTypeOfSymbol(appTypeSymbol);
    const typeArguments = appTypeWithArguments.typeArguments;
    if (typeArguments?.length !== 3) return this.honoResolutionError();

    const [envType, schemaType, basePathType] = typeArguments;
    if (!envType || !schemaType || !basePathType) return this.honoResolutionError();

    return { ok: true, value: { appTypeAlias, envType, schemaType, basePathType } };
  }

  private typeFormatFlags(ts: TypeScriptModule): TSTypeFormatFlags {
    return (
      ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.InTypeAlias |
      ts.TypeFormatFlags.UseSingleQuotesForStringLiteralType
    );
  }

  private renderResolvedType(
    type: import('typescript').Type,
    context: CreateVirtualProgramResult,
    appTypeAlias: import('typescript').TypeAliasDeclaration,
    projectRoot: string,
    containingDir: string,
    ts: TypeScriptModule,
  ): ResolveResult<string> {
    const raw = context.checker.typeToString(type, appTypeAlias, this.typeFormatFlags(ts));
    const normalized = this.normalizeExternalImportReferences(raw);
    return this.inlineLocalImportReferences(
      context.program,
      normalized,
      projectRoot,
      ts,
      containingDir,
    );
  }

  private buildPortableOutput(envText: string, schemaText: string, basePathText: string): string {
    return [
      '// THIS FILE IS GENERATED. DO NOT EDIT.',
      '',
      `export type AppType = import('hono').Hono<`,
      `  ${envText},`,
      `  ${this.normalizeLintSensitiveTypeText(schemaText)},`,
      `  ${basePathText}`,
      '>;',
      '',
    ].join('\n');
  }

  private renderHonoTypes(
    context: CreateVirtualProgramResult,
    types: ResolvedHonoArguments,
    projectRoot: string,
    containingDir: string,
    ts: TypeScriptModule,
  ): ResolveResult<RenderedHonoTypes> {
    const render = (type: import('typescript').Type) =>
      this.renderResolvedType(type, context, types.appTypeAlias, projectRoot, containingDir, ts);

    const envResult = render(types.envType);
    if (!envResult.ok) return envResult;

    const schemaResult = render(types.schemaType);
    if (!schemaResult.ok) return schemaResult;

    const basePathResult = render(types.basePathType);
    if (!basePathResult.ok) return basePathResult;

    return {
      ok: true,
      value: {
        envText: envResult.value,
        schemaText: schemaResult.value,
        basePathText: basePathResult.value,
      },
    };
  }

  private honoResolutionError(): ResolveResult<never> {
    return this.typeResolutionError('AppType was not resolved to Hono<Env, Schema, BasePath>');
  }

  private typeResolutionError(message: string): ResolveResult<never> {
    return { ok: false, error: { kind: 'type_resolution_failed', message } };
  }

  private programCreationError(message: string): ResolveResult<never> {
    return { ok: false, error: { kind: 'program_creation_failed', message } };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
