type TypeScriptModule = typeof import('typescript');
type TSSourceFile = import('typescript').SourceFile;
type TSClassDeclaration = import('typescript').ClassDeclaration;
type TSNode = import('typescript').Node;

export const findClassAtPosition = (
  sourceFile: TSSourceFile,
  pos: number,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    if (ts.isClassDeclaration(node) && node.pos <= pos && pos < node.end) {
      return node;
    }
    return ts.forEachChild(node, find);
  };
  return find(sourceFile);
};

export const findClassByName = (
  sourceFile: TSSourceFile,
  name: string,
  ts: TypeScriptModule,
): TSClassDeclaration | undefined => {
  const find = (node: TSNode): TSClassDeclaration | undefined => {
    if (ts.isClassDeclaration(node) && node.name !== undefined && node.name.text === name) {
      return node;
    }
    return ts.forEachChild(node, find);
  };
  return find(sourceFile);
};
