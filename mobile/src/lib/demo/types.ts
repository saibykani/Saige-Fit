export type Ctx = {
  params: Record<string, string>;
  query: Record<string, string>;
  body: any;
  store: Store;
};
export type Route = { method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; handler: (c: Ctx) => any | Promise<any> };
export interface Store {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}
/** Throw from a handler to return an HTTP-style error, e.g. throw new DemoError(404, 'Not found'). */
export class DemoError extends Error { constructor(public status: number, message: string) { super(message); } }
