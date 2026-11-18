// The generated module's naming and identity conventions. The schema reader checks these names
// for clashes, the renderer declares them, and the registration check matches resolvers by them,
// so all three must derive them here and nowhere else.

const generatedModelKeyName = '@zeltjs/graphql-drizzle/model';

/** The static property that marks a generated resolver class with its model identity. */
export const generatedModelKey = Symbol.for(generatedModelKeyName);

/** The expression the generated module uses to obtain {@link generatedModelKey}. */
export const generatedModelKeyExpression = `globalThis.Symbol.for('${generatedModelKeyName}')`;

export const resolverClassName = (modelName: string): string => `Generated${modelName}Resolver`;

/** Identifies a model across module loaders; `source` names the generated file machine-independently. */
export const modelIdentity = (source: string, modelName: string): string =>
  `${source}#${modelName}`;

export type GeneratedExport = { readonly name: string; readonly role: 'type' | 'resolver' };

/** Every top-level name the generated module exports for one model; they share one namespace. */
export const generatedExports = (modelName: string): readonly GeneratedExport[] => [
  { name: modelName, role: 'type' },
  { name: resolverClassName(modelName), role: 'resolver' },
];
