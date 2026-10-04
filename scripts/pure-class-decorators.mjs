import MagicString from 'magic-string';
import { parseSync } from 'rolldown/utils';

const auditedFiles = new Set([
  'built-in-service/cli/cli.config.ts',
  'built-in-service/env/env.adaptor.ts',
  'built-in-service/env/env.ts',
  'built-in-service/logger/logger.config.ts',
  'built-in-service/logger/logger.service.ts',
  'built-in-service/logger/formatter/jsonl.formatter.ts',
  'built-in-service/logger/formatter/pretty.formatter.config.ts',
  'built-in-service/logger/formatter/pretty.formatter.ts',
  'built-in-service/logger/transport/console.transport.ts',
  'built-in-service/wait-until/wait-until.adaptor.ts',
  'features/command/command.service.ts',
  'features/scheduler/scheduler.service.ts',
  'features/task/task.service.ts',
  'features/http/http.service.ts',
  'features/http/error/default.error-handler.ts',
  'features/http/middleware/cors/cors.config.ts',
  'features/http/middleware/cors/cors.middleware.ts',
  'features/http/middleware/secure-headers/secure-headers.config.ts',
  'features/http/middleware/secure-headers/secure-headers.middleware.ts',
]);

const isDecoratorFactory = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  ((node.callee.name === 'Injectable' && node.arguments.length === 0) ||
    node.callee.name === '_ts_metadata');

// These internal classes register metadata by class identity; no registry enumerates discarded classes.
// Mark their factory calls too; otherwise their evaluation survives when the class is removed.
export const annotateClassDecorators = (code, id) => {
  const relative = id.replaceAll('\\', '/').split('/packages/core/src/')[1];
  if (!auditedFiles.has(relative)) return null;
  const { program, errors } = parseSync(id, code);
  if (errors.length > 0) throw new Error(`Cannot parse decorator output for ${id}`);
  const output = new MagicString(code);
  let changed = false;
  for (const statement of program.body) {
    const assignment = statement.type === 'ExpressionStatement' && statement.expression;
    if (assignment?.type !== 'AssignmentExpression') continue;
    const call = assignment.right;
    if (call.type !== 'CallExpression' || call.callee.type !== 'Identifier' || call.callee.name !== '_ts_decorate') continue;
    const [decorators, target] = call.arguments;
    if (call.arguments.length !== 2 || decorators.type !== 'ArrayExpression' ||
        assignment.left.type !== 'Identifier' || target.type !== 'Identifier' ||
        target.name !== assignment.left.name || decorators.elements.length === 0 ||
        !decorators.elements.every((node) => node &&
          ((node.type === 'Identifier' && ['Config', 'Middleware', 'ErrorHandler'].includes(node.name)) || isDecoratorFactory(node)))) {
      throw new Error(`Unaudited decorator application in ${id}`);
    }
    const declarationStatement = program.body[program.body.indexOf(statement) - 1];
    const declaration = declarationStatement?.type === 'ExportNamedDeclaration'
      ? declarationStatement.declaration : declarationStatement;
    if (declaration?.type !== 'ClassDeclaration' || declaration.id?.name !== target.name) {
      throw new Error(`Unaudited class declaration in ${id}`);
    }
    const referencesTarget = (node) => node && typeof node === 'object' &&
      (node.type === 'Identifier' && node.name === target.name ||
        Object.values(node).some((value) => Array.isArray(value)
          ? value.some(referencesTarget) : referencesTarget(value)));
    if (referencesTarget(decorators)) {
      throw new Error(`Self-referencing decorator metadata in ${id}`);
    }
    // Keep registration in the initializer: a separate self-referencing assignment
    // keeps even an unused class alive in the consumer's bundler.
    const decoratorOutput = new MagicString(code.slice(decorators.start, decorators.end));
    for (const decorator of decorators.elements) {
      if (decorator.type === 'CallExpression') {
        decoratorOutput.appendLeft(decorator.start - decorators.start, '/* @__PURE__ */ ');
      }
    }
    const decoratorsCode = decoratorOutput.toString();
    const classCode = code.slice(declaration.start, declaration.end);
    output.overwrite(declaration.start, declaration.end,
      `let ${target.name} = /* @__PURE__ */ _ts_decorate(${decoratorsCode}, ${classCode});`);
    output.remove(statement.start, statement.end);
    changed = true;
  }
  return changed ? { code: output.toString(), map: output.generateMap({ hires: true, source: id, includeContent: true }) } : null;
};

export const pureClassDecorators = () => ({
  name: 'zelt:pure-internal-class-decorators',
  transform: annotateClassDecorators,
});
