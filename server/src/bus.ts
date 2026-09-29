// In-process event bus. Everything that moves (a step, a purchase, an order status) is published
// here; the API streams it to browsers over SSE (the job page, the office, /books).
import { EventEmitter } from 'node:events';

export type SynclyEvent = {
  type: 'step' | 'purchase' | 'order' | 'cfo';
  orderId?: string;
  jobId?: string;
  at: string;
  data: Record<string, unknown>;
};

export const bus = new EventEmitter();
bus.setMaxListeners(200);

export function publish(e: Omit<SynclyEvent, 'at'>) {
  bus.emit('event', { ...e, at: new Date().toISOString() } satisfies SynclyEvent);
}
