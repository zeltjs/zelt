import { resolve } from 'node:path';
import * as inspection from '@zeltjs/decorator-metadata/inspect';
import { object } from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { generateGraphqlRuntimeForResolvers } from './graphql-sdl-generator.lib';
import type { ID as GraphqlId } from './index';
import {
  args,
  Mutation as MutationDecorator,
  Query as QueryDecorator,
  Relation,
  ResolveField,
  ResolveMultiField,
  Resolver,
} from './index';

const tsconfig = resolve(__dirname, '../tsconfig.json');
const generate = (resolvers: Parameters<typeof generateGraphqlRuntimeForResolvers>[0]) =>
  generateGraphqlRuntimeForResolvers(resolvers, { tsconfig });
type Runtime = Awaited<ReturnType<typeof generate>>;
const modelIn = (runtime: Runtime, name: string) => runtime.models?.[name];
const fieldIn = (runtime: Runtime, owner: string, name: string) =>
  runtime.modelFields?.[owner]?.[name];
const propertyIn = (runtime: Runtime, model: string, name: string) =>
  modelIn(runtime, model)?.properties.find((property) => property.name === name);
const propertyNames = (runtime: Runtime, model: string) =>
  modelIn(runtime, model)?.properties.map((property) => property.name);
const hasQuery = (runtime: Runtime, name: string) =>
  Object.hasOwn(runtime.modelFields?.['Query'] ?? {}, name);

// Identity model: only `id` is known, every other field resolves from it.
type Member = { readonly id: GraphqlId; readonly name: string };
@Resolver()
class MemberResolver {
  @QueryDecorator()
  member(): Pick<Member, 'id'> {
    return { id: 'm1' };
  }
  @ResolveField()
  name(parent: Pick<Member, 'id'>): Member['name'] {
    return `Member ${parent.id}`;
  }
}

// Provided model: the provider's Pick declares which properties it supplies.
type Author = {
  readonly id: GraphqlId;
  readonly name: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly $familyNameFirst: boolean;
  readonly posts: readonly Article[];
  readonly mentor: Author | null;
};
type Article = {
  readonly id: GraphqlId;
  readonly title: string;
  readonly author: Author;
  readonly $authorId: Author['id'];
};
@Resolver()
class AuthorResolver {
  @QueryDecorator()
  authors(): Promise<readonly (Pick<Author, 'id'> | null)[] | null> {
    return Promise.resolve(null);
  }
  @ResolveMultiField()
  values(
    _refs: readonly Pick<Author, 'id'>[],
  ): ReadonlyMap<Author['id'], Pick<Author, 'id' | 'firstName' | 'lastName' | '$familyNameFirst'>> {
    return new Map();
  }
  @ResolveField()
  name(author: Pick<Author, 'firstName' | 'lastName' | '$familyNameFirst'>): Author['name'] {
    return author.$familyNameFirst ? author.lastName : author.firstName;
  }
  @Relation()
  posts(
    _parents: readonly Pick<Author, 'id'>[],
  ): Promise<ReadonlyMap<Author['id'], readonly Pick<Article, 'id'>[]>> {
    return Promise.resolve(new Map());
  }
  @Relation()
  mentor(_author: Pick<Author, 'id'>): Pick<Author, 'id'> | null {
    return null;
  }
}
@Resolver()
class ArticleResolver {
  @ResolveMultiField()
  values(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
    throw new Error('not found');
  }
  @Relation()
  author(article: Pick<Article, '$authorId'>): Pick<Author, 'id'> {
    return { id: article.$authorId };
  }
}

// A provider returning the model itself supplies every declared property.
type Sample = {
  readonly id: string;
  readonly flag: boolean | null;
  readonly optional?: number;
  readonly maybe: string | undefined;
  readonly both: string | null | undefined;
  readonly tags: readonly (string | null)[];
  readonly $secret: { readonly token: string };
};
@Resolver()
class SampleResolver {
  @QueryDecorator('constructor')
  another(): Pick<Sample, 'id'> {
    return { id: '2' };
  }
  @QueryDecorator('toString')
  sample(): Pick<Sample, 'id'> {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(_ref: Pick<Sample, 'id'>): Promise<Sample> {
    return Promise.reject(new Error('not found'));
  }
}

// Batch computed fields publish the per-parent type of each Map value.
type Counter = { readonly id: string; readonly labels: readonly (string | null)[] };
@Resolver()
class CounterResolver {
  @QueryDecorator()
  counter(): Pick<Counter, 'id'> {
    return { id: '1' };
  }
  @ResolveField()
  labels(
    _parents: readonly Pick<Counter, 'id'>[],
  ): Promise<ReadonlyMap<Counter['id'], readonly (string | null)[]>> {
    return Promise.resolve(new Map());
  }
}

type Thing = { readonly id: string; readonly label: string; readonly $code: string };
type ThingRef = Pick<Thing, 'id'>;
type Other = { readonly id: string };
const rejecting = {
  batchWithoutId: (() => {
    @Resolver()
    class BatchWithoutId {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing {
        throw new Error('not found');
      }
      @ResolveField()
      label(_parents: readonly Pick<Thing, '$code'>[]): ReadonlyMap<Thing['id'], string> {
        return new Map();
      }
    }
    return BatchWithoutId;
  })(),
  queryReturnsData: (() => {
    @Resolver()
    class QueryReturnsData {
      @QueryDecorator()
      thing(): Pick<Thing, 'id' | 'label'> {
        return { id: '1', label: '' };
      }
    }
    return QueryReturnsData;
  })(),
  fakeMap: (() => {
    @Resolver()
    class FakeMap {
      @ResolveMultiField()
      load(_refs: readonly Pick<Thing, 'id'>[]): { get(key: string): Thing | null } {
        return { get: () => null };
      }
    }
    return FakeMap;
  })(),
  wrongMapKey: (() => {
    @Resolver()
    class WrongMapKey {
      @ResolveMultiField()
      load(_refs: readonly Pick<Thing, 'id'>[]): ReadonlyMap<number, Thing> {
        return new Map();
      }
    }
    return WrongMapKey;
  })(),
  promiseMapValues: (() => {
    @Resolver()
    class PromiseMapValues {
      @ResolveMultiField()
      load(_refs: readonly Pick<Thing, 'id'>[]): ReadonlyMap<Thing['id'], Promise<Thing>> {
        return new Map();
      }
    }
    return PromiseMapValues;
  })(),
  duplicateProvider: (() => {
    @Resolver()
    class DuplicateProvider {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing {
        throw new Error('not found');
      }
    }
    return DuplicateProvider;
  })(),
  numericId: (() => {
    type NumericId = { readonly id: number };
    @Resolver()
    class NumericIdResolver {
      @QueryDecorator()
      numeric(): Pick<NumericId, 'id'> {
        return { id: 1 };
      }
    }
    return NumericIdResolver;
  })(),
  unsupportedProperty: (() => {
    type Status = { readonly id: string; readonly state: 'on' | 'off' };
    @Resolver()
    class UnsupportedProperty {
      @ResolveMultiField()
      load(_ref: Pick<Status, 'id'>): Status {
        throw new Error('not found');
      }
    }
    return UnsupportedProperty;
  })(),
  undeclaredField: (() => {
    @Resolver()
    class UndeclaredField {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing {
        throw new Error('not found');
      }
      @ResolveField()
      extra(_parent: Pick<Thing, 'id'>): string {
        return '';
      }
    }
    return UndeclaredField;
  })(),
  nullableProvider: (() => {
    @Resolver()
    class NullableProvider {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing | null {
        return null;
      }
    }
    return NullableProvider;
  })(),
  dependencyCycle: (() => {
    type Loop = { readonly id: string; readonly first: string; readonly second: string };
    @Resolver()
    class DependencyCycle {
      @QueryDecorator()
      loop(): Pick<Loop, 'id'> {
        return { id: '1' };
      }
      @ResolveField()
      first(parent: Pick<Loop, 'second'>): string {
        return parent.second;
      }
      @ResolveField()
      second(parent: Pick<Loop, 'first'>): string {
        return parent.first;
      }
    }
    return DependencyCycle;
  })(),
  relationDependency: (() => {
    type Node = { readonly id: string; readonly up: Node | null; readonly label: string };
    @Resolver()
    class RelationDependency {
      @QueryDecorator()
      node(): Pick<Node, 'id'> {
        return { id: '1' };
      }
      @Relation()
      up(_node: Pick<Node, 'id'>): Pick<Node, 'id'> | null {
        return null;
      }
      @ResolveField()
      label(node: Pick<Node, 'up'>): string {
        return String(node.up);
      }
    }
    return RelationDependency;
  })(),
  unsuppliedDependency: (() => {
    @Resolver()
    class UnsuppliedDependency {
      @QueryDecorator()
      thing(): Pick<Thing, 'id'> {
        return { id: '1' };
      }
      @ResolveField()
      label(parent: Pick<Thing, '$code'>): string {
        return parent.$code;
      }
    }
    return UnsuppliedDependency;
  })(),
  computedMismatch: (() => {
    type Score = { readonly id: string; readonly value: number };
    @Resolver()
    class ComputedMismatch {
      @QueryDecorator()
      score(): Pick<Score, 'id'> {
        return { id: '1' };
      }
      @ResolveField()
      value(_parent: Pick<Score, 'id'>): string {
        return '';
      }
    }
    return ComputedMismatch;
  })(),
  computedRelation: (() => {
    @Resolver()
    class ComputedRelation {
      @ResolveMultiField()
      load(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
        throw new Error('not found');
      }
      @ResolveField()
      author(_parent: Pick<Article, 'id'>): string {
        return '';
      }
    }
    return ComputedRelation;
  })(),
  relationTarget: (() => {
    @Resolver()
    class RelationTarget {
      @ResolveMultiField()
      load(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
        throw new Error('not found');
      }
      @Relation()
      author(_parent: Pick<Article, 'id'>): Pick<Other, 'id'> {
        return { id: '' };
      }
    }
    return RelationTarget;
  })(),
  relationNullability: (() => {
    @Resolver()
    class RelationNullability {
      @ResolveMultiField()
      load(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
        throw new Error('not found');
      }
      @Relation()
      author(_parent: Pick<Article, 'id'>): Pick<Author, 'id'> | null {
        return null;
      }
    }
    return RelationNullability;
  })(),
  relationShape: (() => {
    @Resolver()
    class RelationShape {
      @ResolveMultiField()
      load(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
        throw new Error('not found');
      }
      @Relation()
      author(_parent: Pick<Article, 'id'>): readonly Pick<Author, 'id'>[] {
        return [];
      }
    }
    return RelationShape;
  })(),
  missingResolver: (() => {
    @Resolver()
    class MissingResolver {
      @QueryDecorator()
      thing(): Pick<Thing, 'id'> {
        return { id: '1' };
      }
    }
    return MissingResolver;
  })(),
  suppliedTwice: (() => {
    @Resolver()
    class SuppliedTwice {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing {
        throw new Error('not found');
      }
      @ResolveField()
      label(_parent: Pick<Thing, 'id'>): string {
        return '';
      }
    }
    return SuppliedTwice;
  })(),
  resolvedTwice: (() => {
    @Resolver()
    class ResolvedTwice {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Pick<Thing, 'id' | '$code'> {
        throw new Error('not found');
      }
      @ResolveField()
      label(_parent: Pick<Thing, 'id'>): string {
        return '';
      }
      @ResolveField('label')
      other(_parent: Pick<Thing, 'id'>): string {
        return '';
      }
    }
    return ResolvedTwice;
  })(),
  modelMutation: (() => {
    @Resolver()
    class ModelMutation {
      @QueryDecorator()
      member(): Pick<Member, 'id'> {
        return { id: '1' };
      }
      @MutationDecorator()
      rename(): string {
        return '';
      }
    }
    return ModelMutation;
  })(),
  sameName: (() => {
    type Member = { readonly id: string };
    @Resolver()
    class SameName {
      @QueryDecorator()
      otherMember(): Pick<Member, 'id'> {
        return { id: '1' };
      }
    }
    return SameName;
  })(),
  reservedField: (() => {
    @Resolver()
    class ReservedField {
      @QueryDecorator('__reserved')
      member(): Pick<Member, 'id'> {
        return { id: '1' };
      }
    }
    return ReservedField;
  })(),
  undefinedProvider: (() => {
    @Resolver()
    class UndefinedProvider {
      @ResolveMultiField()
      load(_ref: Pick<Thing, 'id'>): Thing | undefined {
        throw new Error('not found');
      }
    }
    return UndefinedProvider;
  })(),
  undefinedRelation: (() => {
    @Resolver()
    class UndefinedRelation {
      @ResolveMultiField()
      load(_ref: Pick<Article, 'id'>): Pick<Article, 'id' | 'title' | '$authorId'> {
        throw new Error('not found');
      }
      @Relation()
      author(_parent: Pick<Article, 'id'>): Pick<Author, 'id'> | undefined {
        return undefined;
      }
    }
    return UndefinedRelation;
  })(),
  fieldArgs: (() => {
    @Resolver()
    class FieldArgs {
      @QueryDecorator()
      member(): Pick<Member, 'id'> {
        return { id: 'm1' };
      }
      @ResolveField()
      name(_parent: Pick<Member, 'id'>, _input = args(object({}))): Member['name'] {
        return '';
      }
    }
    return FieldArgs;
  })(),
  inheritedOwner: (() => {
    @Resolver()
    class InheritedOwner {
      @QueryDecorator()
      owner(): Pick<constructor, 'id'> {
        return { id: '1' };
      }
    }
    return InheritedOwner;
  })(),
};

// A model named like an Object.prototype key must not find inherited fields.
type constructor = { readonly id: string; readonly name: string };

// Aliases of Pick name the same contract as the direct form, and a provider that always finds
// its data need not declare null.
type ThingCode = Pick<Thing, 'id' | '$code'>;
type CodeOf<Model extends { readonly $code: string }> = Pick<Model, '$code'>;
type Chain = { readonly id: GraphqlId; readonly first: string; readonly second: string };
@Resolver()
class ChainResolver {
  @QueryDecorator()
  chain(): Pick<Chain, 'id'> {
    return { id: '1' };
  }
  @ResolveField()
  second(chain: Pick<Chain, 'first'>): string {
    return chain.first.toUpperCase();
  }
  @ResolveField()
  first(chain: Pick<Chain, 'id'>): string {
    return chain.id;
  }
}
@Resolver()
class ProviderWithoutIdResolver {
  @ResolveMultiField()
  load(
    _refs: readonly Pick<Thing, 'id'>[],
  ): ReadonlyMap<Thing['id'], Pick<Thing, 'label' | '$code'>> {
    return new Map();
  }
}
@Resolver()
class AliasedThingResolver {
  @QueryDecorator()
  thing(): ThingRef {
    return { id: '1' };
  }
  @ResolveMultiField()
  load(ref: ThingRef): ThingCode {
    return { id: ref.id, $code: '' };
  }
  @ResolveField()
  label(parent: CodeOf<Thing>): string {
    return parent.$code;
  }
}

// A self relation references its model as both parent and target before anything else does.
type Employee = { readonly id: GraphqlId; readonly manager: Employee | null };
@Resolver()
class EmployeeResolver {
  @Relation()
  manager(_parent: Pick<Employee, 'id'>): Pick<Employee, 'id'> | null {
    return null;
  }
  @QueryDecorator()
  employee(): Pick<Employee, 'id'> {
    return { id: 'e1' };
  }
}

// The runtime keys of computed names and the single implementation of overloads are analyzed.
@Resolver()
class MethodShapeResolver {
  load(_ref: Pick<Thing, 'id'>): Pick<Thing, 'id' | '$code'> | null;
  @ResolveMultiField()
  load(_ref: Pick<Thing, 'id'>): Pick<Thing, 'id' | '$code'> {
    throw new Error('not found');
  }
  @QueryDecorator()
  thing(): Pick<Thing, 'id'> {
    return { id: '1' };
  }
  @ResolveField()
  ['label'](parent: Pick<Thing, '$code'>): string {
    return parent.$code;
  }
}

type Query = { id: string };
@Resolver()
class CollisionQueryResolver {
  @ResolveMultiField()
  load(_ref: Pick<Query, 'id'>): Query {
    throw new Error('not found');
  }
}
type Mutation = { id: string };
@Resolver()
class CollisionMutationResolver {
  @ResolveMultiField()
  load(_ref: Pick<Mutation, 'id'>): Mutation {
    throw new Error('not found');
  }
}
type Subscription = { id: string };
@Resolver()
class CollisionSubscriptionResolver {
  @ResolveMultiField()
  load(_ref: Pick<Subscription, 'id'>): Subscription {
    throw new Error('not found');
  }
}
type ID = { id: string };
@Resolver()
class CollisionIDResolver {
  @ResolveMultiField()
  load(_ref: Pick<ID, 'id'>): ID {
    throw new Error('not found');
  }
}
type String = { id: string };
@Resolver()
class CollisionStringResolver {
  @ResolveMultiField()
  load(_ref: Pick<String, 'id'>): String {
    throw new Error('not found');
  }
}
type Int = { id: string };
@Resolver()
class CollisionIntResolver {
  @ResolveMultiField()
  load(_ref: Pick<Int, 'id'>): Int {
    throw new Error('not found');
  }
}
type Float = { id: string };
@Resolver()
class CollisionFloatResolver {
  @ResolveMultiField()
  load(_ref: Pick<Float, 'id'>): Float {
    throw new Error('not found');
  }
}
type Boolean = { id: string };
@Resolver()
class CollisionBooleanResolver {
  @ResolveMultiField()
  load(_ref: Pick<Boolean, 'id'>): Boolean {
    throw new Error('not found');
  }
}
type $User = { id: string };
@Resolver()
class CollisionDollarUserResolver {
  @ResolveMultiField()
  load(_ref: Pick<$User, 'id'>): $User {
    throw new Error('not found');
  }
}

describe('model code generation', () => {
  it('reads every resolver through one Program even if the cache is cleared meanwhile', async () => {
    const original = inspection.getTypeMetadata;
    // A concurrent generation clears the shared Program cache between inspections.
    const spy = vi.spyOn(inspection, 'getTypeMetadata').mockImplementation((...args) => {
      inspection.clearProgramCache(tsconfig);
      return original(...args);
    });
    try {
      const runtime = await generate([AuthorResolver, ArticleResolver, MemberResolver]);
      expect(Object.keys(runtime.models ?? {})).toEqual(['Author', 'Article', 'Member']);
    } finally {
      spy.mockRestore();
      inspection.clearProgramCache(tsconfig);
    }
  });

  it('resolves an identity model from its id without a provider', async () => {
    const runtime = await generate([MemberResolver]);
    expect(runtime.schemaSdl).toContain('type Query {\n  member: Member!\n}');
    expect(runtime.schemaSdl).toContain('type Member {\n  id: ID!\n  name: String!\n}');
    expect(modelIn(runtime, 'Member')).toEqual({
      kind: 'identity',
      properties: [{ name: 'id', optional: false, value: { kind: 'scalar', name: 'ID' } }],
    });
    expect(fieldIn(runtime, 'Member', 'name')).toEqual({
      kind: 'computed',
      dependencies: ['id'],
      mode: 'single',
      value: { kind: 'scalar', name: 'string' },
    });
  });

  it('publishes provided properties, computed fields and relations declared in the model', async () => {
    const runtime = await generate([AuthorResolver, ArticleResolver]);
    expect(runtime.schemaSdl).toContain('authors: [Author]');
    expect(runtime.schemaSdl).toContain('posts: [Article!]!');
    expect(runtime.schemaSdl).toContain('mentor: Author\n');
    expect(runtime.schemaSdl).toContain('author: Author!');
    expect(runtime.schemaSdl).toContain('firstName: String!');
    expect(runtime.schemaSdl).toContain('name: String!');
    expect(runtime.schemaSdl).not.toContain('$');
    expect(modelIn(runtime, 'Author')).toMatchObject({
      kind: 'provided',
      provider: { resolver: 'AuthorResolver', method: 'values' },
      mode: 'batch',
    });
    expect(propertyNames(runtime, 'Author')).toEqual([
      'id',
      'firstName',
      'lastName',
      '$familyNameFirst',
    ]);
    expect(fieldIn(runtime, 'Author', 'posts')).toEqual({
      kind: 'relation',
      target: 'Article',
      shape: { kind: 'many', nullable: false, itemNullable: false },
      dependencies: ['id'],
      mode: 'batch',
    });
    expect(fieldIn(runtime, 'Article', 'author')).toMatchObject({
      dependencies: ['$authorId'],
      mode: 'single',
    });
    expect(fieldIn(runtime, 'Query', 'authors')).toMatchObject({
      shape: { kind: 'many', nullable: true, itemNullable: true },
    });
  });

  it('maps declared property types and keeps private data opaque', async () => {
    const runtime = await generate([SampleResolver]);
    const property = (name: string) => propertyIn(runtime, 'Sample', name);
    expect(modelIn(runtime, 'Sample')).toMatchObject({ kind: 'provided', mode: 'single' });
    expect(property('id')?.value).toEqual({ kind: 'scalar', name: 'string' });
    expect(property('maybe')?.value).toEqual({
      kind: 'optional',
      inner: { kind: 'scalar', name: 'string' },
    });
    expect(property('both')?.value).toEqual({
      kind: 'optional',
      inner: { kind: 'nullable', inner: { kind: 'scalar', name: 'string' } },
    });
    expect(property('$secret')?.value.kind).toBe('opaque');
    expect(runtime.schemaSdl).toContain('id: String!');
    expect(runtime.schemaSdl).toContain('flag: Boolean\n');
    expect(runtime.schemaSdl).toContain('optional: Float\n');
    expect(runtime.schemaSdl).toContain('tags: [String]!');
    expect(hasQuery(runtime, 'toString')).toBe(true);
    expect(hasQuery(runtime, 'constructor')).toBe(true);
  });

  it('publishes the per-parent type of batch computed fields', async () => {
    const runtime = await generate([CounterResolver]);
    expect(runtime.schemaSdl).toContain('labels: [String]!');
    expect(runtime.schemaSdl).not.toContain('Map');
    expect(fieldIn(runtime, 'Counter', 'labels')).toMatchObject({ mode: 'batch' });
  });

  it('analyzes computed method names and overloaded methods once', async () => {
    const runtime = await generate([MethodShapeResolver]);
    expect(propertyNames(runtime, 'Thing')).toEqual(['id', '$code']);
    expect(fieldIn(runtime, 'Thing', 'label')).toMatchObject({ dependencies: ['$code'] });
  });

  it('accepts a provider Pick without id because the id is its input', async () => {
    const runtime = await generate([ProviderWithoutIdResolver]);
    expect(propertyNames(runtime, 'Thing')).toEqual(['id', '$code', 'label']);
  });

  it('accepts aliased Picks and a provider without null', async () => {
    const runtime = await generate([AliasedThingResolver]);
    expect(hasQuery(runtime, 'thing')).toBe(true);
    expect(propertyNames(runtime, 'Thing')).toEqual(['id', '$code']);
    expect(fieldIn(runtime, 'Thing', 'label')).toMatchObject({ dependencies: ['$code'] });
  });

  it('accepts a computed field depending on another computed field', async () => {
    const runtime = await generate([ChainResolver]);
    expect(fieldIn(runtime, 'Chain', 'second')).toMatchObject({
      kind: 'computed',
      dependencies: ['first'],
    });
  });

  it('analyzes a self relation declared before any other reference to its model', async () => {
    const runtime = await generate([EmployeeResolver]);
    expect(fieldIn(runtime, 'Employee', 'manager')).toMatchObject({
      kind: 'relation',
      target: 'Employee',
    });
  });

  it.each([
    ['a batch parent without id', [rejecting.batchWithoutId], 'batch parent Pick requires id'],
    ['a query returning data', [rejecting.queryReturnsData], "must return Pick<Model, 'id'>"],
    ['a Map look-alike', [rejecting.fakeMap], 'batch methods must return a Map'],
    ['a Map keyed by another type', [rejecting.wrongMapKey], 'Map key must match model id type'],
    ['Promise Map values', [rejecting.promiseMapValues], 'batch Map values cannot be Promise'],
    [
      'two providers for one model',
      [rejecting.duplicateProvider, rejecting.suppliedTwice],
      'duplicate provider for model Thing',
    ],
    ['a numeric id', [rejecting.numericId], 'requires a non-null scalar id'],
    ['a literal union property', [rejecting.unsupportedProperty], 'unsupported public property'],
    ['an undeclared field', [rejecting.undeclaredField], 'must be declared in Thing'],
    ['an unsupplied dependency', [rejecting.unsuppliedDependency], 'unknown source dependency'],
    ['a provider returning null', [rejecting.nullableProvider], 'provider result cannot be null'],
    ['a computed dependency cycle', [rejecting.dependencyCycle], 'dependency cycle Loop.first'],
    ['a dependency on a relation', [rejecting.relationDependency], 'dependency up is a relation'],
    ['a mismatched computed type', [rejecting.computedMismatch], 'not assignable to Score.value'],
    ['a computed model reference', [rejecting.computedRelation], 'resolve model references'],
    [
      'a relation to another model',
      [rejecting.relationTarget, AuthorResolver],
      'is not a Other relation',
    ],
    [
      'a nullable relation into a non-null field',
      [rejecting.relationNullability, AuthorResolver],
      'does not fit',
    ],
    [
      'a list relation into a single field',
      [rejecting.relationShape, AuthorResolver],
      'does not fit',
    ],
    ['a property without resolver', [rejecting.missingResolver], 'Thing.label has no resolver'],
    [
      'a field the provider supplies',
      [rejecting.suppliedTwice],
      'the provider already supplies it',
    ],
    ['a field resolved twice', [rejecting.resolvedTwice], 'duplicate field Thing.label'],
    ['a mutation in a model resolver', [rejecting.modelMutation], 'cannot declare mutations'],
    ['two model types named alike', [MemberResolver, rejecting.sameName], 'already named Member'],
    ['an invalid field name', [rejecting.reservedField], 'invalid GraphQL field name'],
    ['a provider returning undefined', [rejecting.undefinedProvider], 'provider result must be'],
    [
      'a relation returning undefined',
      [rejecting.undefinedRelation, AuthorResolver],
      'references cannot be undefined',
    ],
    [
      'args() on a model field method',
      [rejecting.fieldArgs],
      'FieldArgs.name: args() is not supported on model field methods',
    ],
    [
      'a property shadowed by Object.prototype',
      [rejecting.inheritedOwner],
      'constructor.name has no resolver',
    ],
  ])('rejects %s', async (_name, resolvers, message) => {
    await expect(generate(resolvers)).rejects.toThrow(message);
  });

  it.each([
    CollisionQueryResolver,
    CollisionMutationResolver,
    CollisionSubscriptionResolver,
    CollisionIDResolver,
    CollisionStringResolver,
    CollisionIntResolver,
    CollisionFloatResolver,
    CollisionBooleanResolver,
    CollisionDollarUserResolver,
  ])('rejects reserved or invalid model names: %s', async (resolver) => {
    await expect(generate([resolver])).rejects.toThrow();
  });
});
