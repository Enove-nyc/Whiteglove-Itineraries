import assert from "node:assert/strict";
import test from "node:test";
import { createItinerarySaveQueue, type SaveState } from "../lib/itinerary-save-queue";

const tick = () => new Promise<void>(resolve => setImmediate(resolve));

test("rapid edits write in order and retain the newest snapshot", async () => {
  const writes: number[] = [];
  const releases: Array<() => void> = [];
  const states: SaveState[] = [];
  const queue = createItinerarySaveQueue<number>(value => {
    writes.push(value);
    return new Promise(resolve => releases.push(resolve));
  }, state => states.push(state));
  queue.enqueue(1);
  queue.enqueue(2);
  queue.enqueue(3);
  assert.deepEqual(writes, [1]);
  releases.shift()!();
  await tick();
  assert.deepEqual(writes, [1, 3]);
  assert.equal(queue.hasUnsaved(), true);
  releases.shift()!();
  await tick();
  assert.equal(queue.hasUnsaved(), false);
  assert.deepEqual(states, ["saving", "saved"]);
});

test("failed save stays unsaved and retry sends the latest edit", async () => {
  const writes: string[] = [];
  let reject: (error: Error) => void = () => {};
  const queue = createItinerarySaveQueue<string>(value => {
    writes.push(value);
    if (writes.length === 1) return new Promise((_resolve, fail) => { reject = fail; });
    return Promise.resolve();
  }, () => {});
  queue.enqueue("first");
  queue.enqueue("latest");
  reject(new Error("offline"));
  await tick();
  assert.equal(queue.getState(), "error");
  assert.equal(queue.hasUnsaved(), true);
  queue.retry();
  await tick();
  assert.deepEqual(writes, ["first", "latest"]);
  assert.equal(queue.getState(), "saved");
});
