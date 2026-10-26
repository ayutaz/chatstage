// The browser can start with a running AudioContext (OBS) or require a click.
// Keep speech readiness separate from chat startup so a chat error cannot be
// mislabeled as a model failure or make the retry button skip chat forever.
export class OverlaySession {
  constructor({
    prepareAudio,
    resumeAudio = async () => {},
    startChat,
    onReady = () => {},
    onAudioError = () => {},
    onChatError = () => {},
    isDestroyed = () => false,
  }) {
    Object.assign(this, {
      prepareAudio,
      resumeAudio,
      startChat,
      onReady,
      onAudioError,
      onChatError,
      isDestroyed,
    });
    this.audioReady = false;
    this.chatReady = false;
    this.starting = null;
  }
  start(userGesture = false) {
    if (this.isDestroyed()) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.run(userGesture).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }
  async run(userGesture) {
    try {
      if (this.audioReady) await this.resumeAudio();
      else {
        const ready = await this.prepareAudio(userGesture);
        if (!ready || this.isDestroyed()) return;
        this.audioReady = true;
      }
    } catch (error) {
      if (!this.isDestroyed()) this.onAudioError(error);
      return;
    }
    if (this.isDestroyed()) return;
    this.onReady();
    if (this.chatReady) return;
    try {
      await this.startChat();
      this.chatReady = true;
    } catch (error) {
      if (!this.isDestroyed()) this.onChatError(error);
    }
  }
}
