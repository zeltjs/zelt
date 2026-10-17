/** A renderer response retains its virtual URL across clones. */
export class BridgeResponse extends Response {
  override readonly url: string = '';

  constructor(body: BodyInit | null, init: ResponseInit, url: string) {
    super(body, init);
    this.url = url;
  }

  override clone(): Response {
    const response = super.clone();
    return new BridgeResponse(
      response.body,
      { status: response.status, statusText: response.statusText, headers: response.headers },
      this.url,
    );
  }
}
