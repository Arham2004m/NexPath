// A failure the mentor knows how to explain to a student. `code` never carries provider details.
export class ProviderError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code; // not_configured | quota | auth | unavailable | blocked | aborted
  }
}
