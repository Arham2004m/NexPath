// Runs async jobs strictly one after another and tells the caller when the whole queue has drained.
// Rapid tick / untick clicks therefore reach the server in the order they were made, and a slow earlier answer can
// never overwrite a newer one.
export function createSerialQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    // `job` runs after every earlier job; the returned promise resolves with { value, idle } or { error, idle },
    // where idle is true when nothing else is waiting (so only the last answer needs to be shown).
    run(job) {
      pending += 1;
      const result = tail.then(async () => {
        try { return { value: await job(), error: null }; } catch (error) { return { value: null, error }; }
      }).then((outcome) => { pending -= 1; return { ...outcome, idle: pending === 0 }; });
      tail = result.catch(() => {});
      return result;
    }
  };
}
