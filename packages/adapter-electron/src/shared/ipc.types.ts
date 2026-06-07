export type IpcBody =
  | { kind: 'none' }
  | { kind: 'text'; readonly value: string }
  | { kind: 'arrayBuffer'; readonly value: ArrayBuffer };

export type IpcFetchRequest = {
  readonly method: string;
  readonly path: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly body: IpcBody;
};

export type IpcFetchResponse = {
  readonly status: number;
  readonly statusText: string;
  readonly headers: ReadonlyArray<readonly [string, string]>;
  readonly body: IpcBody;
};

export type IpcSender = (request: IpcFetchRequest) => Promise<IpcFetchResponse>;
