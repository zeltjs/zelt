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

  private parseTypeText(
    source: string,
    ts: TypeScriptModule,
  ): { readonly sourceFile: TSSourceFile; readonly typeNode: import('typescript').TypeNode } {
    const sourceFile = ts.createSourceFile(
      '__portable_type.ts',
      `type __Portable = ${source};`,
      ts.ScriptTarget.Latest,
      true,
    );
    const statement = sourceFile.statements[0];
    if (!statement || !ts.isTypeAliasDeclaration(statement)) {
      throw new Error('Failed to parse rendered type text');
    }
    return { sourceFile, typeNode: statement.type };
  }

  private typeParameterSubstitutions(
    declaration: LocalTypeDeclaration,
    typeArguments: readonly import('typescript').TypeNode[],
  ): ReadonlyMap<string, import('typescript').TypeNode> {
    const substitutions = new Map<string, import('typescript').TypeNode>();
    for (const [index, typeParameter] of (declaration.typeParameters ?? []).entries()) {
      const argument = typeArguments[index];
      if (argument) substitutions.set(typeParameter.name.text, argument);
    }
    return substitutions;
  }

  private declarationTypeNode(
    declaration: LocalTypeDeclaration,
    ts: TypeScriptModule,
  ): import('typescript').TypeNode {
    if (ts.isTypeAliasDeclaration(declaration)) return declaration.type;
    return ts.factory.createTypeLiteralNode(declaration.members);
  }

  private importTypeReference(
    node: import('typescript').ImportTypeNode,
    ts: TypeScriptModule,
  ): { readonly modulePath: string; readonly exportName: string } | undefined {
    if (!ts.isLiteralTypeNode(node.argument)) return undefined;
    if (!ts.isStringLiteral(node.argument.literal)) return undefined;
    if (!node.qualifier || !ts.isIdentifier(node.qualifier)) return undefined;
    return { modulePath: node.argument.literal.text, exportName: node.qualifier.text };
  }

  private findImportedLocalTypeDeclaration(
    program: TSProgram,
    sourceFile: TSSourceFile,
    typeName: string,
    projectRoot: string,
    ts: TypeScriptModule,
  ): { readonly sourceFile: TSSourceFile; readonly declaration: LocalTypeDeclaration } | undefined {
    for (const statement of sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const namedBindings = statement.importClause?.namedBindings;
      if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;

      for (const element of namedBindings.elements) {
        if (element.name.text !== typeName) continue;

        const localModulePath = this.getLocalModulePath(
          statement.moduleSpecifier.text,
          projectRoot,
          dirname(sourceFile.fileName),
        );
        if (!localModulePath) return undefined;

        const importedSourceFile = this.getSourceFileForImport(program, localModulePath);
        if (!importedSourceFile) return undefined;

        const exportName = element.propertyName?.text ?? element.name.text;
        const declaration = this.findLocalTypeDeclaration(importedSourceFile, exportName, ts);
        if (!declaration) return undefined;

        return { sourceFile: importedSourceFile, declaration };
      }
    }
    return undefined;
  }

  private inlineDeclarationTypeNode(
    program: TSProgram,
    declaration: LocalTypeDeclaration,
    declarationSourceFile: TSSourceFile,
    typeArguments: readonly import('typescript').TypeNode[],
    projectRoot: string,
    ts: TypeScriptModule,
    transformContext: import('typescript').TransformationContext,
    seen: ReadonlySet<string>,
  ): import('typescript').TypeNode {
    const substitutions = this.typeParameterSubstitutions(declaration, typeArguments);
    return this.inlineLocalTypeNode(
      program,
      this.declarationTypeNode(declaration, ts),
      declarationSourceFile,
      dirname(declarationSourceFile.fileName),
      projectRoot,
      ts,
      transformContext,
      substitutions,
      seen,
    );
  }

  private inlineLocalTypeNode(
    program: TSProgram,
    node: import('typescript').TypeNode,
    sourceFile: TSSourceFile,
    containingDir: string,
    projectRoot: string,
    ts: TypeScriptModule,
    transformContext: import('typescript').TransformationContext,
    substitutions: ReadonlyMap<string, import('typescript').TypeNode>,
    seen: ReadonlySet<string>,
  ): import('typescript').TypeNode {
    const visit = (child: import('typescript').Node): import('typescript').Node => {
      if (ts.isTypeReferenceNode(child) && ts.isIdentifier(child.typeName)) {
        const substitution = substitutions.get(child.typeName.text);
        if (substitution) return ts.visitNode(substitution, visit);

        const localDeclaration = this.findLocalTypeDeclaration(sourceFile, child.typeName.text, ts);
        if (localDeclaration) {
          return this.inlineResolvedDeclaration(
            program,
            localDeclaration,
            sourceFile,
            child.typeArguments ?? [],
            sourceFile,
            containingDir,
            projectRoot,
            ts,
            transformContext,
            seen,
          );
        }

        const importedDeclaration = this.findImportedLocalTypeDeclaration(
          program,
          sourceFile,
          child.typeName.text,
          projectRoot,
          ts,
        );
        if (importedDeclaration) {
          return this.inlineResolvedDeclaration(
            program,
            importedDeclaration.declaration,
            importedDeclaration.sourceFile,
            child.typeArguments ?? [],
            sourceFile,
            containingDir,
            projectRoot,
            ts,
            transformContext,
            seen,
          );
        }
      }

      if (ts.isImportTypeNode(child)) {
        const reference = this.importTypeReference(child, ts);
        if (!reference) return ts.visitEachChild(child, visit, transformContext);
        if (!this.isInsideProjectRoot(reference.modulePath, projectRoot, containingDir)) {
          return ts.visitEachChild(child, visit, transformContext);
        }

        const localModulePath = this.getLocalModulePath(
          reference.modulePath,
          projectRoot,
          containingDir,
        );
        if (!localModulePath) return ts.visitEachChild(child, visit, transformContext);

        const importedSourceFile = this.getSourceFileForImport(program, localModulePath);
        if (!importedSourceFile) return ts.visitEachChild(child, visit, transformContext);

        const declaration = this.findLocalTypeDeclaration(
          importedSourceFile,
          reference.exportName,
          ts,
        );
        if (!declaration) return ts.visitEachChild(child, visit, transformContext);

        return this.inlineResolvedDeclaration(
          program,
          declaration,
          importedSourceFile,
          child.typeArguments ?? [],
          sourceFile,
          containingDir,
          projectRoot,
          ts,
          transformContext,
          seen,
        );
      }

      return ts.visitEachChild(child, visit, transformContext);
    };

    return ts.visitNode(node, visit) as import('typescript').TypeNode;
  }

  private inlineResolvedDeclaration(
    program: TSProgram,
    declaration: LocalTypeDeclaration,
    declarationSourceFile: TSSourceFile,
    typeArguments: readonly import('typescript').TypeNode[],
    typeArgumentSourceFile: TSSourceFile,
    typeArgumentContainingDir: string,
    projectRoot: string,
    ts: TypeScriptModule,
    transformContext: import('typescript').TransformationContext,
    seen: ReadonlySet<string>,
  ): import('typescript').TypeNode {
    const key = `${declarationSourceFile.fileName}#${declaration.name.text}`;
    if (seen.has(key)) {
      throw new Error(`Recursive local type reference is not supported: ${key}`);
    }

    const nextSeen = new Set(seen);
    nextSeen.add(key);
    const resolvedTypeArguments = typeArguments.map((argument) =>
      this.inlineLocalTypeNode(
        program,
        argument,
        typeArgumentSourceFile,
        typeArgumentContainingDir,
        projectRoot,
        ts,
        transformContext,
        new Map(),
        seen,
      ),
    );
    return this.inlineDeclarationTypeNode(
      program,
      declaration,
      declarationSourceFile,
      resolvedTypeArguments,
      projectRoot,
      ts,
      transformContext,
      nextSeen,
    );
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
    const parsed = this.parseTypeText(source, ts);
    const transformed = ts.transform(parsed.typeNode, [
      (context) => (root) =>
        this.inlineLocalTypeNode(
          program,
          root,
          parsed.sourceFile,
          containingDir,
          projectRoot,
          ts,
          context,
          new Map(),
          new Set(),
        ),
    ]);
    const transformedNode = transformed.transformed[0];
    if (!transformedNode) {
      transformed.dispose();
      return this.typeResolutionError('Local type reference expansion returned no type node');
    }

    const result = this.printNode(transformedNode, parsed.sourceFile, ts);
    transformed.dispose();
    return { ok: true, value: result };
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
