// Preparation and playback are separate: at most one synthesis is in flight,
// while the next FIFO entry can be prepared during current audio playback.
export class SpeechQueue {
  constructor({
    synthesize,
    play,
    maxLength = 20,
    onChange = () => {},
    onStart = () => {},
    onEnd = () => {},
    onError = () => {},
    onPauseChange,
  }) {
    Object.assign(this, {
      synthesize,
      play,
      maxLength,
      onChange,
      onStart,
      onEnd,
      onError,
      onPauseChange,
    });
    this.items = [];
    this.current = null;
    this.preparing = null;
    this.prepared = null;
    this.paused = false;
    this.enabled = false;
    this.dropped = 0;
  }
  snapshot() {
    return {
      waiting: this.items.length,
      current: this.current?.item || null,
      paused: this.paused,
      dropped: this.dropped,
      preparing: Boolean(this.preparing),
    };
  }
  changed() {
    this.onChange(this.snapshot());
  }
  start() {
    this.enabled = true;
    this.kick();
  }
  enqueue(item) {
    this.items.push(item);
    while (this.items.length > this.maxLength) {
      this.items.shift();
      this.dropped++;
    }
    this.kick();
  }
  remove(predicate) {
    this.items = this.items.filter((item) => !predicate(item));
    if (this.prepared && predicate(this.prepared.item)) this.prepared = null;
    if (this.current && predicate(this.current.item)) this.stopCurrent();
    this.kick();
  }
  stopCurrent() {
    const current = this.current;
    if (!current) return;
    this.current = null;
    current.handle?.stop();
    this.onEnd(current.item);
  }
  skip() {
    if (this.current) this.stopCurrent();
    else {
      this.items.shift();
      this.prepared = null;
    }
    this.kick();
  }
  clear() {
    this.items = [];
    this.prepared = null;
    this.stopCurrent();
    this.kick();
  }
  setPaused(paused) {
    this.paused = paused;
    const handle = this.current?.handle;
    // An AudioContext can still be suspended after the paused source was
    // deleted/skipped. Resume the transport even when there is no current line.
    try {
      const change = this.onPauseChange
        ? this.onPauseChange(paused)
        : paused
          ? handle?.pause?.()
          : handle?.resume?.();
      Promise.resolve(change).catch((error) => this.onError(error));
    } catch (error) {
      this.onError(error);
    }
    this.kick();
  }
  kick() {
    if (this.prepared && this.prepared.item !== this.items[0]) this.prepared = null;
    if (!this.enabled) {
      this.changed();
      return;
    }
    if (!this.paused && !this.current && this.prepared) {
      const { item, audio } = this.prepared;
      this.items.shift();
      this.prepared = null;
      const entry = { item, handle: null };
      this.current = entry;
      try {
        entry.handle = this.play(audio, item);
        this.onStart(item, audio, entry.handle);
        Promise.resolve(entry.handle.finished).then(
          () => {
            if (this.current !== entry) return;
            this.current = null;
            this.onEnd(item);
            this.kick();
          },
          (error) => {
            if (this.current !== entry) return;
            this.stopCurrent();
            this.onError(error, item);
            this.kick();
          },
        );
      } catch (error) {
        entry.handle?.stop();
        this.current = null;
        this.onError(error, item);
      }
    }
    if (!this.preparing && !this.prepared && this.items.length && !this.paused) {
      const item = this.items[0];
      const work = { item };
      this.preparing = work;
      Promise.resolve()
        .then(() => this.synthesize(item))
        .then(
          (audio) => {
            if (this.items[0] === item) this.prepared = { item, audio };
          },
          (error) => {
            if (this.items.includes(item)) {
              this.items = this.items.filter((entry) => entry !== item);
              this.onError(error, item);
            }
          },
        )
        .finally(() => {
          this.preparing = null;
          this.kick();
        });
    }
    this.changed();
  }
}
