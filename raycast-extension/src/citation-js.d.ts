declare module "@citation-js/core" {
  export class Cite {
    constructor(data?: unknown);
    format(name: string, options?: Record<string, unknown>): unknown;
  }
}
