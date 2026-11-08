export type SaveState = "idle" | "saving" | "saved" | "error";

/** Only one account write at a time. Pending snapshots coalesce to the latest edit. */
export function createItinerarySaveQueue<T>(write: (value: T) => Promise<void>, changed: (state: SaveState) => void) {
  let pending: { value: T } | undefined;
  let running = false;
  const waiting: Array<(saved: boolean) => void> = [];
  let state: SaveState = "idle";
  const update = (next: SaveState) => { state = next; changed(next); };
  async function drain() {
    if (running || !pending) return;
    running = true;
    update("saving");
    while (pending) {
      const current = pending;
      pending = undefined;
      try {
        await write(current.value);
      } catch {
        // Keep a newer edit if one arrived during the failed request.
        pending ??= current;
        running = false;
        update("error");
        waiting.splice(0).forEach(resolve => resolve(false));
        return;
      }
    }
    running = false;
    update("saved");
    waiting.splice(0).forEach(resolve => resolve(true));
  }
  return {
    enqueue(value: T): Promise<boolean> {
      pending = { value };
      const result = new Promise<boolean>(resolve => waiting.push(resolve));
      void drain();
      return result;
    },
    retry() { void drain(); },
    hasUnsaved() { return running || Boolean(pending); },
    getState() { return state; },
  };
}
