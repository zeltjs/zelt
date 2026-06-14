import type { Rule } from 'eslint';
import type { Node } from 'estree';

// The "narrowTo" idiom: an overload signature promises a different type while
// the implementation returns its argument unchanged. The compiler's lenient
// overload-implementation compatibility check turns this into an unchecked
// cast that is harder to spot than `as`, so each occurrence must be tracked.
//
//   function narrowToX(value: A): X;
//   function narrowToX(value: A): A {
//     return value;
//   }

type FunctionLikeEntry = {
  readonly type: string;
  readonly id?: { readonly type: string; readonly name: string } | null;
  readonly declaration?: FunctionLikeEntry | null;
};

const unwrapExport = (entry: FunctionLikeEntry): FunctionLikeEntry =>
  entry.type === 'ExportNamedDeclaration' && entry.declaration ? entry.declaration : entry;

const hasOverloadSignature = (node: Node & Rule.NodeParentExtension, name: string): boolean => {
  const container =
    node.parent.type === 'ExportNamedDeclaration' ? node.parent.parent : node.parent;
  const body: unknown = Reflect.get(container, 'body');
  if (!Array.isArray(body)) return false;

  return body.some((entry: FunctionLikeEntry) => {
    const declaration = unwrapExport(entry);
    return declaration.type === 'TSDeclareFunction' && declaration.id?.name === name;
  });
};

const returnsOwnParameter = (node: {
  readonly params: readonly { readonly type: string; readonly name?: string }[];
  readonly body: { readonly body: readonly Node[] };
}): boolean => {
  const statements = node.body.body;
  if (statements.length !== 1) return false;

  const statement = statements[0];
  if (!statement || statement.type !== 'ReturnStatement') return false;
  if (!statement.argument || statement.argument.type !== 'Identifier') return false;

  const returned = statement.argument.name;
  return node.params.some((param) => param.type === 'Identifier' && param.name === returned);
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow overload-based identity casts that re-type a value without validation',
    },
    messages: {
      overloadCast:
        '"{{name}}" is an overload-based cast: it re-types its argument with no runtime check, ' +
        'exploiting the lenient overload-implementation compatibility check. This is an unchecked ' +
        'conversion like "as" but harder to spot. Validate the value or redesign the type boundary.',
    },
    schema: [],
  },

  create(context) {
    return {
      FunctionDeclaration(node) {
        if (!node.id || node.params.length === 0) return;
        if (!returnsOwnParameter(node)) return;
        if (!hasOverloadSignature(node, node.id.name)) return;

        context.report({
          node,
          messageId: 'overloadCast',
          data: { name: node.id.name },
        });
      },
    };
  },
};

export default rule;
