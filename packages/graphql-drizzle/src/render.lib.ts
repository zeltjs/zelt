import type { Model, ModelRelation } from './schema.types';

export const generatedModelKey = Symbol.for('@zeltjs/graphql-drizzle/model');
const quote = (value: string): string => JSON.stringify(value);
const propertyName = (value: string): string =>
  /^[$_\p{ID_Start}](?:[$_\p{ID_Continue}]|\u200C|\u200D)*$/u.test(value) ? value : quote(value);
const column = (table: string, key: string): string => `${table}[${quote(key)}]`;
const tableRef = (model: Model): string => `schema[${quote(model.exportName)}]`;
const pickColumns = (model: Model): string =>
  `Pick<${model.name}, ${model.columns.map((item) => quote(item.property)).join(' | ')}>`;

const relationType = (relation: ModelRelation): string => {
  if (relation.kind === 'many') return `readonly ${relation.target}[]`;
  return `${relation.target}${relation.nullable ? ' | null' : ''}`;
};

const renderInterface = (model: Model): string => {
  const columns = model.columns.map(({ key, property }) => {
    const type = `${model.rowName}[${quote(key)}]`;
    return `  readonly ${propertyName(property)}: ${property === 'id' ? `ID<${type}>` : type};`;
  });
  const relations = model.relations.map(
    (relation) => `  readonly ${propertyName(relation.key)}: ${relationType(relation)};`,
  );
  return `type ${model.rowName} = typeof schema.${model.exportName}.$inferSelect;\n\nexport interface ${model.name} {\n${[...columns, ...relations].join('\n')}\n}`;
};

const renderValues = (model: Model): string => {
  const table = tableRef(model);
  const pk = column(table, model.primaryKey);
  const selection = model.columns
    .map(({ key, property }) => `      ${propertyName(property)}: ${column(table, key)},`)
    .join('\n');
  return `  @ResolveMultiField()
  async $drizzleValues(refs: readonly Pick<${model.name}, 'id'>[]): Promise<ReadonlyMap<${model.name}['id'], ${pickColumns(model)}>> {
    if (refs.length === 0) return new Map();
    const rows = await this.#database.client.select({
${selection}
    }).from(${table}).where(inArray(${pk}, refs.map(({ id }) => id)));
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    const result = new Map<${model.name}['id'], ${pickColumns(model)}>();
    for (const { id } of refs) {
      const row = byId.get(id);
      if (!row) throw new Error(${quote(`${model.name} `)} + String(id) + ' not found');
      result.set(id, row);
    }
    return result;
  }`;
};

const renderRequired = (model: Model, relation: ModelRelation, targetPick: string): string => {
  return relation.kind === 'one' && !relation.nullable
    ? `
    const required = new Map<${model.name}['id'], ${targetPick}>();
    for (const { id } of refs) {
      const value = result.get(id);
      if (!value) throw new Error(${quote(`${model.name}.${relation.key}: missing target for `)} + String(id));
      required.set(id, value);
    }
    return required;`
    : '\n    return result;';
};

const renderRelation = (model: Model, relation: ModelRelation): string => {
  const source = tableRef(model);
  const pk = column(source, model.primaryKey);
  const targetId = column('target', relation.targetPrimaryKey);
  const joins = relation.joins
    .map((join) => `eq(${column(source, join.source)}, ${column('target', join.target)})`)
    .join(', ');
  const targetPick = `Pick<${relation.target}, 'id'>`;
  const resultType = relation.kind === 'many' ? `${targetPick}[]` : `${targetPick} | null`;
  const returnType =
    relation.kind === 'many'
      ? `readonly ${targetPick}[]`
      : `${targetPick}${relation.nullable ? ' | null' : ''}`;
  const accumulate =
    relation.kind === 'many'
      ? `      result.get(row.parentId)?.push({ id: row.targetId });`
      : `      result.set(row.parentId, { id: row.targetId });`;
  const required = renderRequired(model, relation, targetPick);
  return `  @Relation(${quote(relation.key)})
  async ${propertyName(`$drizzleRelation_${relation.key}`)}(refs: readonly Pick<${model.name}, 'id'>[]): Promise<ReadonlyMap<${model.name}['id'], ${returnType}>> {
    if (refs.length === 0) return new Map();
    const target = ${model.dialect}Alias(schema[${quote(relation.targetExport)}], ${quote(`zelt_${model.exportName}_${relation.key}`)});
    const rows = await this.#database.client.select({ parentId: ${pk}, targetId: ${targetId} })
      .from(${source}).innerJoin(target, and(${joins}))
      .where(inArray(${pk}, refs.map(({ id }) => id)))
      .orderBy(asc(${targetId}));
    const result = new Map<${model.name}['id'], ${resultType}>(refs.map(({ id }) => [id, ${relation.kind === 'many' ? '[]' : 'null'}]));
    for (const row of rows) {
${accumulate}
    }${required}
  }`;
};

export type RenderOptions = {
  readonly schemaImport: string;
  readonly databaseImport: string;
  readonly databaseExport: string;
  readonly source: string;
  readonly header: string;
};

export const renderModels = (models: readonly Model[], options: RenderOptions): string => {
  if (models.length === 0) return `${options.header}\nexport {};\n`;
  const dialects = [
    ...new Set(models.filter((model) => model.relations.length > 0).map((model) => model.dialect)),
  ];
  const imports = [
    options.header,
    `import { inject } from '@zeltjs/core';`,
    `import { ${models.some((model) => model.relations.length > 0) ? 'Relation, ' : ''}ResolveMultiField, type ID } from '@zeltjs/graphql';`,
    `import { ${dialects.length > 0 ? 'and, asc, eq, ' : ''}inArray } from 'drizzle-orm';`,
    ...dialects.map(
      (dialect) =>
        `import { alias as ${dialect}Alias } from 'drizzle-orm/${dialect === 'pg' ? 'pg' : 'sqlite'}-core';`,
    ),
    `import * as schema from ${quote(options.schemaImport)};`,
    `import { ${options.databaseExport} as Database } from ${quote(options.databaseImport)};`,
  ];
  const classes = models.map(
    (model) => `export abstract class Generated${model.name}Resolver {
  static readonly [$zeltDrizzleModel] = ${quote(`${options.source}#${model.name}`)};
  readonly #database = inject(Database);

${renderValues(model)}${model.relations.map((relation) => `\n\n${renderRelation(model, relation)}`).join('')}
}`,
  );
  return `${imports.join('\n')}\n\nconst $zeltDrizzleModel = Symbol.for('@zeltjs/graphql-drizzle/model');\n\n${models.map(renderInterface).join('\n\n')}\n\n${classes.join('\n\n')}\n`;
};
