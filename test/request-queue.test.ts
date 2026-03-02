import { describe, test, expect, mock } from "bun:test";
import { RequestQueue } from "../src/request-queue.js";

describe("RequestQueue", () => {
  test("executes a single task and returns its result", async () => {
    const queue = new RequestQueue();
    const result = await queue.enqueue(() => Promise.resolve("hello"));
    expect(result).toBe("hello");
  });

  test("serializes concurrent tasks (only one runs at a time)", async () => {
    const queue = new RequestQueue({ cooldownMs: 0 });
    const running: number[] = [];
    let maxConcurrent = 0;

    const task = (id: number) =>
      queue.enqueue(async () => {
        running.push(id);
        maxConcurrent = Math.max(maxConcurrent, running.length);
        await new Promise((r) => setTimeout(r, 30));
        running.splice(running.indexOf(id), 1);
        return id;
      });

    const results = await Promise.all([task(1), task(2), task(3)]);
    expect(results).toEqual([1, 2, 3]);
    expect(maxConcurrent).toBe(1);
  });

  test("enforces cooldown between consecutive tasks", async () => {
    const cooldownMs = 50;
    const queue = new RequestQueue({ cooldownMs });
    const timestamps: number[] = [];

    const task = () =>
      queue.enqueue(async () => {
        timestamps.push(Date.now());
        return true;
      });

    await task();
    await task();
    await task();

    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      expect(gap).toBeGreaterThanOrEqual(cooldownMs - 5);
    }
  });

  test("rejects new tasks when queue is full", async () => {
    const queue = new RequestQueue({ maxSize: 1, cooldownMs: 0 });

    const blocker = queue.enqueue(
      () => new Promise((r) => setTimeout(() => r("a"), 100))
    );
    const queued = queue.enqueue(() => Promise.resolve("b"));

    await expect(
      queue.enqueue(() => Promise.resolve("c"))
    ).rejects.toThrow("queue is full");

    await blocker;
    await queued;
  });

  test("error in one task does not affect others", async () => {
    const queue = new RequestQueue({ cooldownMs: 0 });

    const p1 = queue.enqueue(() => Promise.reject(new Error("boom")));
    const p2 = queue.enqueue(() => Promise.resolve("ok"));

    await expect(p1).rejects.toThrow("boom");
    expect(await p2).toBe("ok");
  });

  test("reports pending count and busy state", async () => {
    const queue = new RequestQueue({ cooldownMs: 0 });
    expect(queue.pending).toBe(0);
    expect(queue.busy).toBe(false);

    let resolveBlocker!: () => void;
    const blocker = queue.enqueue(
      () => new Promise<void>((r) => { resolveBlocker = r; })
    );
    await new Promise((r) => setTimeout(r, 5));

    expect(queue.busy).toBe(true);

    const p2 = queue.enqueue(() => Promise.resolve("x"));
    expect(queue.pending).toBe(1);

    resolveBlocker();
    await blocker;
    await p2;
    expect(queue.pending).toBe(0);
    expect(queue.busy).toBe(false);
  });
});
