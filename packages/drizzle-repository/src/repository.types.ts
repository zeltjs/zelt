declare const existed: unique symbol;

// Marks an id whose row was confirmed to exist, so unconfirmed ids cannot reach getById.
export type Existed<T, Model extends string> = T & { readonly [existed]: Model };

export type SaveInput<Model, NewModel> =
  | { pre: null; readonly input: NewModel }
  | { readonly pre: Model; readonly input: Model };

export type Row = Readonly<Record<string, unknown>>;
