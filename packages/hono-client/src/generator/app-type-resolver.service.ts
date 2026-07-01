import { dirname, isAbsolute, resolve, win32 } from 'node:path';

import { Injectable } from '@zeltjs/core';

type TypeScriptModule = typeof import('typescript');
type TSCompilerOptions = Parameters<TypeScriptModule['createCompilerHost']>[0];
type TSDiagnostic = import('typescript').Diagnostic;
type TSImportTypeNode = import('typescript').ImportTypeNode;
type TSNamedImports = import('typescript').NamedImports;
type TSNode = import('typescript').Node;
type TSProgram = import('typescript').Program;
type TSSourceFile = import('typescript').SourceFile;
type TSTransformationContext = import('typescript').TransformationContext;
type TSTypeFormatFlags = import('typescript').TypeFormatFlags;
type TSTypeNode = import('typescript').TypeNode;
type TSTypeReferenceNode = import('typescript').TypeReferenceNode;
type TSVisitResult = import('typescript').VisitResult<TSNode>;

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

type InlineTypeNodeResult =
  | { ok: true; readonly value: import('typescript').TypeNode }
  | { ok: false; readonly message: string };

type InlineLocalTypeContext = {
  readonly program: TSProgram;
  readonly sourceFile: TSSourceFile;
  readonly containingDir: string;
  readonly projectRoot: string;
  readonly ts: TypeScriptModule;
  readonly transformContext: TSTransformationContext;
  readonly substitutions: ReadonlyMap<string, TSTypeNode>;
  readonly seen: ReadonlySet<string>;
};

type InlineVisitResult =
  | { ok: true; readonly replacement: TSNode | undefined }
  | { ok: false; readonly message: string };

type InlineTypeVisitor = (node: TSNode) => TSVisitResult;

type ImportedLocalTypeDeclaration = {
  readonly sourceFile: TSSourceFile;
  readonly declaration: LocalTypeDeclaration;
};

type ParsedTypeTextResult =
  | {
      ok: true;
      readonly value: {
        readonly sourceFile: TSSourceFile;
        readonly typeNode: import('typescript').TypeNode;
      };
    }
  | { ok: false; readonly message: string };

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
    const normalizedModulePath = this.normalizePathSeparators(absoluteModulePath);
    for (const [test, specifier] of this.externalModuleRewrites) {
      if (normalizedModulePath.includes(test)) return specifier;
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

  private parseTypeText(source: string, ts: TypeScriptModule): ParsedTypeTextResult {
    const sourceFile = ts.createSourceFile(
      '__portable_type.ts',
      `type __Portable = ${source};`,
      ts.ScriptTarget.Latest,
      true,
    );
    const statement = sourceFile.statements[0];
    if (!statement || !ts.isTypeAliasDeclaration(statement)) {
      return { ok: false, message: 'Failed to parse rendered type text' };
    }
    return { ok: true, value: { sourceFile, typeNode: statement.type } };
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

  private namedImportDeclaration(
    statement: TSNode,
    ts: TypeScriptModule,
  ): { readonly modulePath: string; readonly namedBindings: TSNamedImports } | undefined {
    if (!ts.isImportDeclaration(statement)) return undefined;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) return undefined;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) return undefined;
    return { modulePath: statement.moduleSpecifier.text, namedBindings };
  }

  private findImportedTypeReference(
    sourceFile: TSSourceFile,
    typeName: string,
    ts: TypeScriptModule,
  ): { readonly modulePath: string; readonly exportName: string } | undefined {
    for (const statement of sourceFile.statements) {
      const importDeclaration = this.namedImportDeclaration(statement, ts);
      const element = importDeclaration?.namedBindings.elements.find(
        (binding) => binding.name.text === typeName,
      );
      if (!importDeclaration || !element) continue;
      return {
        modulePath: importDeclaration.modulePath,
        exportName: element.propertyName?.text ?? element.name.text,
      };
    }
    return undefined;
  }

  private findImportedLocalTypeDeclaration(
    program: TSProgram,
    sourceFile: TSSourceFile,
    typeName: string,
    projectRoot: string,
    ts: TypeScriptModule,
  ): ImportedLocalTypeDeclaration | undefined {
    const reference = this.findImportedTypeReference(sourceFile, typeName, ts);
    if (!reference) return undefined;

    const localModulePath = this.getLocalModulePath(
      reference.modulePath,
      projectRoot,
      dirname(sourceFile.fileName),
    );
    if (!localModulePath) return undefined;

    const importedSourceFile = this.getSourceFileForImport(program, localModulePath);
    if (!importedSourceFile) return undefined;

    const declaration = this.findLocalTypeDeclaration(importedSourceFile, reference.exportName, ts);
    if (!declaration) return undefined;

    return { sourceFile: importedSourceFile, declaration };
  }

  private inlineDeclarationTypeNode(
    program: TSProgram,
    declaration: LocalTypeDeclaration,
    declarationSourceFile: TSSourceFile,
    typeArguments: readonly import('typescript').TypeNode[],
    projectRoot: string,
    ts: TypeScriptModule,
    transformContext: TSTransformationContext,
    seen: ReadonlySet<string>,
  ): InlineTypeNodeResult {
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
    node: TSTypeNode,
    sourceFile: TSSourceFile,
    containingDir: string,
    projectRoot: string,
    ts: TypeScriptModule,
    transformContext: TSTransformationContext,
    substitutions: ReadonlyMap<string, TSTypeNode>,
    seen: ReadonlySet<string>,
  ): InlineTypeNodeResult {
    const context = {
      program,
      sourceFile,
      containingDir,
      projectRoot,
      ts,
      transformContext,
      substitutions,
      seen,
    };
    let failureMessage: string | undefined;
    const visit = (child: TSNode): TSVisitResult => {
      if (failureMessage) return child;
      const result = this.inlineLocalTypeChild(child, context, visit);
      if (!result.ok) {
        failureMessage = result.message;
        return child;
      }
      if (result.replacement) return result.replacement;
      return ts.visitEachChild(child, visit, transformContext);
    };

    const result = ts.visitNode(node, visit, ts.isTypeNode);
    if (failureMessage) return { ok: false, message: failureMessage };
    return { ok: true, value: result };
  }

  private inlineLocalTypeChild(
    child: TSNode,
    context: InlineLocalTypeContext,
    visit: InlineTypeVisitor,
  ): InlineVisitResult {
    const { ts } = context;
    if (ts.isTypeReferenceNode(child)) {
      return this.inlineTypeReferenceNode(child, context, visit);
    }
    if (ts.isImportTypeNode(child)) return this.inlineImportTypeNode(child, context);
    return { ok: true, replacement: undefined };
  }

  private inlineTypeReferenceNode(
    node: TSTypeReferenceNode,
    context: InlineLocalTypeContext,
    visit: InlineTypeVisitor,
  ): InlineVisitResult {
    if (!context.ts.isIdentifier(node.typeName)) return { ok: true, replacement: undefined };

    const typeName = node.typeName.text;
    const substitution = context.substitutions.get(typeName);
    if (substitution) return this.inlineSubstitutionTypeNode(substitution, context, visit);

    const localDeclaration = this.findLocalTypeDeclaration(
      context.sourceFile,
      typeName,
      context.ts,
    );
    if (localDeclaration) {
      return this.inlineDeclarationVisitResult(
        localDeclaration,
        context.sourceFile,
        node.typeArguments ?? [],
        context,
      );
    }

    const importedDeclaration = this.findImportedLocalTypeDeclaration(
      context.program,
      context.sourceFile,
      typeName,
      context.projectRoot,
      context.ts,
    );
    if (!importedDeclaration) return { ok: true, replacement: undefined };

    return this.inlineDeclarationVisitResult(
      importedDeclaration.declaration,
      importedDeclaration.sourceFile,
      node.typeArguments ?? [],
      context,
    );
  }

  private inlineSubstitutionTypeNode(
    substitution: TSTypeNode,
    context: InlineLocalTypeContext,
    visit: InlineTypeVisitor,
  ): InlineVisitResult {
    const replacement = context.ts.visitNode(substitution, visit, context.ts.isTypeNode);
    return { ok: true, replacement };
  }

  private inlineImportTypeNode(
    node: TSImportTypeNode,
    context: InlineLocalTypeContext,
  ): InlineVisitResult {
    const reference = this.importTypeReference(node, context.ts);
    if (!reference) return { ok: true, replacement: undefined };
    if (
      !this.isInsideProjectRoot(reference.modulePath, context.projectRoot, context.containingDir)
    ) {
      return { ok: true, replacement: undefined };
    }

    const localModulePath = this.getLocalModulePath(
      reference.modulePath,
      context.projectRoot,
      context.containingDir,
    );
    if (!localModulePath) return { ok: true, replacement: undefined };

    const sourceFile = this.getSourceFileForImport(context.program, localModulePath);
    if (!sourceFile) return { ok: true, replacement: undefined };

    const declaration = this.findLocalTypeDeclaration(sourceFile, reference.exportName, context.ts);
    if (!declaration) return { ok: true, replacement: undefined };

    return this.inlineDeclarationVisitResult(
      declaration,
      sourceFile,
      node.typeArguments ?? [],
      context,
    );
  }

  private inlineDeclarationVisitResult(
    declaration: LocalTypeDeclaration,
    declarationSourceFile: TSSourceFile,
    typeArguments: readonly TSTypeNode[],
    context: InlineLocalTypeContext,
  ): InlineVisitResult {
    const result = this.inlineResolvedDeclaration(
      context.program,
      declaration,
      declarationSourceFile,
      typeArguments,
      context.sourceFile,
      context.containingDir,
      context.projectRoot,
      context.ts,
      context.transformContext,
      context.seen,
    );
    if (!result.ok) return result;
    return { ok: true, replacement: result.value };
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
  ): InlineTypeNodeResult {
    const key = `${declarationSourceFile.fileName}#${declaration.name.text}`;
    if (seen.has(key)) {
      return { ok: false, message: `Recursive local type reference is not supported: ${key}` };
    }

    const nextSeen = new Set(seen);
    nextSeen.add(key);
    const resolvedTypeArguments: import('typescript').TypeNode[] = [];
    for (const argument of typeArguments) {
      const result = this.inlineLocalTypeNode(
        program,
        argument,
        typeArgumentSourceFile,
        typeArgumentContainingDir,
        projectRoot,
        ts,
        transformContext,
        new Map(),
        seen,
      );
      if (!result.ok) return result;
      resolvedTypeArguments.push(result.value);
    }
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
    if (!modulePath.startsWith('.')) return modulePath;
    if (this.isWindowsAbsolutePath(containingDir)) return win32.resolve(containingDir, modulePath);
    return resolve(containingDir, modulePath);
  }

  private normalizePathSeparators(pathText: string): string {
    return pathText.replace(/\\+/g, '/').replace(/\/+/g, '/');
  }

  private isWindowsAbsolutePath(pathText: string): boolean {
    return /^[A-Za-z]:[\\/]/.test(pathText);
  }

  private isAbsolutePath(pathText: string): boolean {
    return isAbsolute(pathText) || this.isWindowsAbsolutePath(pathText);
  }

  private normalizeAbsolutePath(pathText: string): string {
    const absolutePath = this.isWindowsAbsolutePath(pathText) ? pathText : resolve(pathText);
    return this.normalizePathSeparators(absolutePath);
  }

  private isNodeModulesPath(pathText: string): boolean {
    return this.normalizePathSeparators(pathText).includes('/node_modules/');
  }

  private normalizeProjectRoot(projectRoot: string): string {
    const normalized = this.normalizeAbsolutePath(projectRoot);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private isInsideProjectRoot(
    modulePath: string,
    projectRoot: string,
    containingDir: string,
  ): boolean {
    const resolvedPath = this.resolveModulePath(modulePath, containingDir);
    if (!this.isAbsolutePath(resolvedPath)) return false;
    if (this.isNodeModulesPath(resolvedPath)) return false;
    return this.normalizeAbsolutePath(resolvedPath).startsWith(
      this.normalizeProjectRoot(projectRoot),
    );
  }

  private getLocalModulePath(
    modulePath: string,
    projectRoot: string,
    containingDir: string,
  ): string | undefined {
    const resolvedPath = this.resolveModulePath(modulePath, containingDir);
    if (this.isNodeModulesPath(modulePath)) return undefined;
    if (!this.isInsideProjectRoot(modulePath, projectRoot, containingDir)) return undefined;
    return resolvedPath;
  }

  private stripTextRanges(
    node: TSTypeNode,
    ts: TypeScriptModule,
    transformContext: TSTransformationContext,
  ): TSTypeNode {
    const visit = (child: TSNode): TSVisitResult => {
      const visited = ts.visitEachChild(child, visit, transformContext);
      return ts.setTextRange(visited, { pos: -1, end: -1 });
    };

    return ts.visitNode(node, visit, ts.isTypeNode);
  }

  private inlineLocalImportReferences(
    program: TSProgram,
    source: string,
    projectRoot: string,
    ts: TypeScriptModule,
    containingDir: string,
  ): ResolveResult<string> {
    const parsed = this.parseTypeText(source, ts);
    if (!parsed.ok) return this.typeResolutionError(parsed.message);

    let failureMessage: string | undefined;
    const transformed = ts.transform(parsed.value.typeNode, [
      (context) => (root) => {
        const result = this.inlineLocalTypeNode(
          program,
          root,
          parsed.value.sourceFile,
          containingDir,
          projectRoot,
          ts,
          context,
          new Map(),
          new Set(),
        );
        if (result.ok) return this.stripTextRanges(result.value, ts, context);
        failureMessage = result.message;
        return root;
      },
    ]);
    if (failureMessage) {
      transformed.dispose();
      return this.typeResolutionError(failureMessage);
    }
    const transformedNode = transformed.transformed[0];
    if (!transformedNode) {
      transformed.dispose();
      return this.typeResolutionError('Local type reference expansion returned no type node');
    }

    const result = this.printNode(transformedNode, parsed.value.sourceFile, ts);
    transformed.dispose();
    return { ok: true, value: result };
  }

  private assertNoLocalReferences(source: string, projectRoot: string): ResolveResult<void> {
    const normalizedSource = this.normalizePathSeparators(source);
    const relativeReference = /import\(['"](\.{1,2}\/[^'"]+)['"]\)/.exec(normalizedSource)?.[1];
    if (relativeReference) {
      return {
        ok: false,
        error: { kind: 'local_reference_leaked', reference: relativeReference },
      };
    }
    const normalizedProjectRoot = this.normalizeProjectRoot(projectRoot);
    if (!normalizedSource.includes(normalizedProjectRoot)) return { ok: true, value: undefined };
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

    const diagnosticsResult = this.assertNoVirtualSourceDiagnostics(program, sf, ts);
    if (!diagnosticsResult.ok) return diagnosticsResult;

    return { ok: true, value: { program, checker: program.getTypeChecker(), sourceFile: sf } };
  }

  private assertNoVirtualSourceDiagnostics(
    program: TSProgram,
    sourceFile: TSSourceFile,
    ts: TypeScriptModule,
  ): ResolveResult<void> {
    const diagnostics = [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ];
    if (diagnostics.length === 0) return { ok: true, value: undefined };
    return this.typeResolutionError(this.formatDiagnostics(diagnostics, ts));
  }

  private formatDiagnostics(diagnostics: readonly TSDiagnostic[], ts: TypeScriptModule): string {
    return diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n');
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
