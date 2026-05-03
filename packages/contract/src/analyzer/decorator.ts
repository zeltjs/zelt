import { type ClassDeclaration, type MethodDeclaration, type Node, SyntaxKind } from 'ts-morph';

const HTTP_METHOD_MAP = {
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE',
} as const;

type HttpMethod = (typeof HTTP_METHOD_MAP)[keyof typeof HTTP_METHOD_MAP];

type ControllerDecoratorInfo = {
  readonly basePath: string;
};

export type RouteDecoratorInfo = {
  readonly method: HttpMethod;
  readonly path: string;
};

// 入力文字列が HTTP_METHOD_MAP のキーであれば対応する method を返す。type predicate を避けるための直接 lookup。
const lookupHttpMethod = (name: string): HttpMethod | undefined => {
  const entries: ReadonlyArray<[string, HttpMethod]> = Object.entries(HTTP_METHOD_MAP);
  for (const [key, value] of entries) {
    if (key === name) return value;
  }
  return undefined;
};

// ts-morph の StringLiteral.getText() は quote 文字を含む。剥がして literal value を取り出す。
const stringLiteralArg = (decoratorName: string, args: readonly Node[]): string => {
  const first = args[0];
  if (!first || first.getKind() !== SyntaxKind.StringLiteral) {
    throw new Error(`koya/contract: @${decoratorName} requires a string literal argument`);
  }
  const text = first.getText();
  return text.slice(1, -1);
};

export const extractControllerDecorator = (
  cls: ClassDeclaration,
): ControllerDecoratorInfo | undefined => {
  const dec = cls.getDecorator('Controller');
  if (!dec) return undefined;
  return { basePath: stringLiteralArg('Controller', dec.getArguments()) };
};

export const extractRouteDecorator = (m: MethodDeclaration): RouteDecoratorInfo | undefined => {
  for (const dec of m.getDecorators()) {
    const name = dec.getName();
    const method = lookupHttpMethod(name);
    if (method !== undefined) {
      return {
        method,
        path: stringLiteralArg(name, dec.getArguments()),
      };
    }
  }
  return undefined;
};
