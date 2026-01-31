// import { AsyncLocalStorage } from 'async_hooks';
// export const asyncLocalStorage = new AsyncLocalStorage<Map<string, any>>();




import { AsyncLocalStorage } from 'async_hooks';

export type TraceStore = {
  traceId?: string;
};

export const traceStorage = new AsyncLocalStorage<TraceStore>();
