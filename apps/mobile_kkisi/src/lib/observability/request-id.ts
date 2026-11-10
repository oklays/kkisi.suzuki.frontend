// Runtime-neutral (also used by the proxy): no Node-only imports here.
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;
/** An incoming id (nginx $request_id) is kept only when it is a plain token; anything else is replaced. */
export const acceptRequestId = (incoming: string | null, generate: () => string): string => (incoming && REQUEST_ID.test(incoming) ? incoming : generate());
