import { IRCFramer } from './irc.js';
import { normalizeChannel } from './config.js';
export class TwitchChat {
  constructor(
    channel,
    {
      onMessage,
      onStatus = () => {},
      WebSocketClass = globalThis.WebSocket,
      // Native Window timers reject a TwitchChat receiver in Chromium.
      // Binding also preserves that receiver when called from retry/cleanup.
      schedule = globalThis.setTimeout.bind(globalThis),
      cancel = globalThis.clearTimeout.bind(globalThis),
      random = Math.random,
    } = {},
  ) {
    this.channel = normalizeChannel(channel);
    if (!this.channel) throw new Error('Enter a valid Twitch channel name.');
    Object.assign(this, { onMessage, onStatus, WebSocketClass, schedule, cancel, random });
    this.attempt = 0;
    this.stopped = true;
    this.socket = null;
    this.timer = null;
    this.watchdog = null;
  }
  connect() {
    if (!this.stopped && (this.socket || this.timer !== null)) return;
    this.stopped = false;
    this.onStatus('connecting', `Connecting to #${this.channel}`);
    let socket;
    try {
      socket = new this.WebSocketClass('wss://irc-ws.chat.twitch.tv:443');
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    const framer = new IRCFramer();
    let joined = false;
    socket.onopen = () => {
      if (this.socket !== socket || this.stopped) return;
      socket.send('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
      socket.send('PASS SCHMOOPIIE\r\n');
      socket.send(`NICK justinfan${Math.floor(this.random() * 900000000) + 100000000}\r\n`);
      socket.send(`JOIN #${this.channel}\r\n`);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || this.stopped) return;
      for (const m of framer.push(String(event.data))) {
        if (m.command === 'PING') socket.send(`PONG :${m.text}\r\n`);
        else if (m.command === 'RECONNECT') socket.close();
        else if (
          m.command === 'ROOMSTATE' ||
          (m.command === '366' && m.params.includes(`#${this.channel}`))
        ) {
          if (!joined) {
            joined = true;
            this.cancel(this.watchdog);
            this.watchdog = null;
            this.attempt = 0;
            this.onStatus('connected', `Listening to #${this.channel}`);
          }
        } else if (m.command === 'NOTICE') this.onStatus('notice', m.text);
        this.onMessage?.(m);
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.cancel(this.watchdog);
      this.watchdog = null;
      this.socket = null;
      if (!this.stopped) this.retry();
    };
    this.watchdog = this.schedule(() => {
      if (this.socket === socket) socket.close();
    }, 20000);
  }
  retry() {
    if (this.stopped) return;
    const delay =
      Math.min(30000, 1000 * 2 ** Math.min(6, this.attempt++)) + Math.floor(this.random() * 500);
    this.onStatus('reconnecting', `Reconnecting in ${(delay / 1000).toFixed(1)}s`);
    this.timer = this.schedule(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
  disconnect() {
    this.stopped = true;
    this.cancel(this.timer);
    this.cancel(this.watchdog);
    this.timer = null;
    this.watchdog = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}
