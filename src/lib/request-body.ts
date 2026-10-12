/** Bound memory use before parsing untrusted webhook JSON, including chunked bodies. */
export class RequestBodyTooLarge extends Error {}

export async function readBoundedBody(request: Request, maxBytes = 256 * 1024): Promise<string> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > maxBytes) throw new RequestBodyTooLarge();
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0;
  let body = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLarge();
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
