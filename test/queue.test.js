import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SpeechQueue } from '../src/queue.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function harness(maxLength = 3) {
  const work = [],
    playing = [],
    errors = [],
    ended = [];
  const queue = new SpeechQueue({
    maxLength,
    synthesize: (item) => {
      const task = deferred();
      work.push({ item, ...task });
      return task.promise;
    },
    play: (audio, item) => {
      const done = deferred();
      const handle = {
        finished: done.promise,
        stop() {
          this.stopped = true;
          done.resolve();
        },
        pause() {
          this.paused = true;
        },
        resume() {
          this.paused = false;
        },
        done,
      };
      playing.push({ audio, item, handle });
      return handle;
    },
    onError: (error) => errors.push(error),
    onEnd: (item) => ended.push(item),
  });
  return { queue, work, playing, errors, ended };
}
test('queue drops oldest on overload and reports cumulative dropped count', () => {
  const h = harness(2);
  h.queue.enqueue({ id: 1 });
  h.queue.enqueue({ id: 2 });
  h.queue.enqueue({ id: 3 });
  assert.deepEqual(
    h.queue.items.map((x) => x.id),
    [2, 3],
  );
  assert.equal(h.queue.snapshot().dropped, 1);
});
test('FIFO playback prefetches one next item while current plays', async () => {
  const h = harness();
  h.queue.start();
  h.queue.enqueue({ id: 1 });
  h.queue.enqueue({ id: 2 });
  h.queue.enqueue({ id: 3 });
  await flush();
  assert.equal(h.work.length, 1);
  h.work[0].resolve('first');
  await flush();
  assert.equal(h.playing[0].item.id, 1);
  assert.equal(h.work[1].item.id, 2);
  h.work[1].resolve('second');
  await flush();
  assert.equal(h.playing.length, 1);
  h.playing[0].handle.done.resolve();
  await flush();
  assert.equal(h.playing[1].item.id, 2);
  assert.equal(h.work[2].item.id, 3);
});
test('ban/delete cancels current and invalidates in-flight audio without resurrection', async () => {
  const h = harness();
  h.queue.start();
  h.queue.enqueue({ id: 1, userId: 'a' });
  h.queue.enqueue({ id: 2, userId: 'a' });
  h.queue.enqueue({ id: 3, userId: 'b' });
  await flush();
  h.work[0].resolve('a1');
  await flush();
  h.queue.remove((item) => item.userId === 'a');
  assert.equal(h.playing[0].handle.stopped, true);
  h.work[1].resolve('a2');
  await flush();
  assert.equal(h.playing.length, 1);
  assert.equal(h.work[2].item.id, 3);
  h.work[2].resolve('b');
  await flush();
  assert.equal(h.playing[1].item.id, 3);
});
test('pause during synthesis holds prepared audio and resume retains FIFO', async () => {
  const h = harness();
  h.queue.start();
  h.queue.enqueue({ id: 1 });
  await flush();
  h.queue.setPaused(true);
  h.work[0].resolve('one');
  await flush();
  assert.equal(h.playing.length, 0);
  h.queue.setPaused(false);
  assert.equal(h.playing.length, 1);
  h.queue.setPaused(true);
  assert.equal(h.playing[0].handle.paused, true);
  h.queue.setPaused(false);
  assert.equal(h.playing[0].handle.paused, false);
});
test('skip and clear discard preparation, errors advance to next message', async () => {
  const h = harness();
  h.queue.start();
  h.queue.enqueue({ id: 1 });
  h.queue.enqueue({ id: 2 });
  await flush();
  h.queue.skip();
  h.work[0].resolve('stale');
  await flush();
  assert.equal(h.work[1].item.id, 2);
  h.work[1].reject(Error('model unavailable'));
  await flush();
  assert.equal(h.errors.length, 1);
  assert.equal(h.queue.items.length, 0);
  h.queue.enqueue({ id: 3 });
  await flush();
  h.queue.clear();
  h.work[2].resolve('stale');
  await flush();
  assert.equal(h.playing.length, 0);
});
test('overload while synthesizing discards dropped prepared message', async () => {
  const h = harness(1);
  h.queue.start();
  h.queue.enqueue({ id: 1 });
  await flush();
  h.queue.enqueue({ id: 2 });
  h.work[0].resolve('stale');
  await flush();
  assert.equal(h.playing.length, 0);
  assert.equal(h.work[1].item.id, 2);
});
test('global audio transport resumes after clearing a paused current line', async () => {
  const h = harness();
  const transport = [];
  h.queue.onPauseChange = (paused) => transport.push(paused);
  h.queue.start();
  h.queue.enqueue({ id: 1 });
  await flush();
  h.work[0].resolve('one');
  await flush();
  h.queue.setPaused(true);
  h.queue.clear();
  h.queue.setPaused(false);
  assert.equal(h.queue.current, null);
  assert.deepEqual(transport, [true, false]);
});
