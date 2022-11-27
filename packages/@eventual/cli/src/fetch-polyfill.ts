if (!globalThis.fetch) {
  const {
    default: fetch,
    Headers,
    Request,
    Response,
  } = await import("node-fetch");

  const g = globalThis as any;
  g.fetch ||= fetch;
  g.Headers ||= Headers;
  g.Request ||= Request;
  g.Response ||= Response;
}
