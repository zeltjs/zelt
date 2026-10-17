const signalOf = (request: Request): AbortSignal | null => request.signal;

/** Owns a body snapshot so cloning does not depend on txiki's stream teeing. */
export class BufferedRequest extends Request {
  constructor(
    input: Request,
    private readonly bodySnapshot: ArrayBuffer | null,
  ) {
    const signal = signalOf(input);
    super(input.url, {
      method: input.method,
      headers: input.headers,
      body: bodySnapshot?.slice(0) ?? null,
      ...(signal ? { signal } : {}),
    });
  }

  /** @throws {TypeError} */
  override clone(): Request {
    if (this.bodyUsed || this.body?.locked) throw new TypeError('Cannot clone a consumed Request');
    return new BufferedRequest(this, this.bodySnapshot);
  }
}
