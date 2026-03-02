import { sleep } from "./utils.js";

export interface QueueConfig {
  maxSize: number;
  cooldownMs: number;
}

const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 10,
  cooldownMs: 2000,
};

interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

export class RequestQueue {
  private readonly config: QueueConfig;
  private readonly queue: QueueItem<any>[] = [];
  private running = false;
  private lastFinishedAt = 0;

  constructor(config?: Partial<QueueConfig>) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config };
  }

  get pending(): number {
    return this.queue.length;
  }

  get busy(): boolean {
    return this.running;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.queue.length >= this.config.maxSize && this.running) {
      throw new Error("queue is full");
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      if (!this.running) {
        void this.drain();
      }
    });
  }

  private async drain(): Promise<void> {
    this.running = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift()!;

      const elapsed = Date.now() - this.lastFinishedAt;
      const remaining = Math.min(
        this.config.cooldownMs - elapsed,
        this.config.cooldownMs
      );
      if (this.lastFinishedAt > 0 && remaining > 0) {
        await sleep(remaining);
      }

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      }

      this.lastFinishedAt = Date.now();
    }

    this.running = false;
  }
}
