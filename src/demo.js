import { parseIRC } from './irc.js';
const PEOPLE = {
  miso: ['101', 'miso_moon', '#C5CDA5'],
  peach: ['102', 'peachy', '#F3AE8F'],
  pixel: ['103', 'pixelpal', '#B8B8E2'],
  moss: ['104', 'mossclub', '#A4CFCA'],
  sunny: ['105', 'sunny_side', '#F1CF85'],
  mod: ['106', 'stage_manager', '#A4CFCA'],
};
// These are IRC fixtures, so the demo exercises the same parser, commands,
// moderation, cleaning, and queue as a real Twitch connection.
export const DEMO_SCRIPT = [
  [0, 'miso', 'Hey chat, we’re part of the show now!'],
  [4500, 'peach', 'こんにちは！みんなで楽しもう！'],
  [9000, 'pixel', '你好，欢迎来到我们的小舞台。'],
  [13500, 'moss', '¡Hola amigos! Qué bonito escenario.'],
  [18000, 'sunny', 'Bonjour à tous, merci beaucoup !'],
  [22500, 'miso', 'Olá! Obrigado por assistir!'],
  [27000, 'peach', '😀 Kappa Check https://example.com wwwwwww 草草草草', 'emotes=25:2-6'],
  [31500, 'pixel', '!voice 7'],
  [32000, 'pixel', 'My new voice has a little extra personality.'],
  [36500, 'mod', '!pause'],
  [37500, 'sunny', 'A tiny intermission. We’ll be right back!'],
  [39500, 'mod', '!resume'],
  [42500, 'moss', 'This line might get skipped by our stage manager.'],
  [43800, 'mod', '!skip'],
  [46500, 'pixel', 'A queued line the moderator will remove.'],
  [46600, 'pixel', 'Another queued line from the same chatter.'],
  [46900, 'ban', 'pixel'],
  [50000, 'sunny', 'Good moderation keeps the stage welcoming.'],
  [55000, 'miso', 'Your community. Their voices. One little stage.'],
];
export function demoMessage(person, text, sequence, extra = '', channel = 'chatstage') {
  if (person === 'ban') {
    const [id, login] = PEOPLE[text];
    return parseIRC(
      `@target-user-id=${id};ban-duration=60 :tmi.twitch.tv CLEARCHAT #${channel} :${login}`,
    );
  }
  const [id, login, color] = PEOPLE[person];
  return parseIRC(
    `@user-id=${id};id=demo-${sequence};display-name=${login};color=${color};badges=${person === 'mod' ? 'moderator/1' : 'subscriber/1'};mod=${person === 'mod' ? '1' : '0'};${extra} :${login}!${login}@demo PRIVMSG #${channel} :${text}`,
  );
}
export function startDemo(onMessage, channel = 'chatstage') {
  let sequence = 0,
    timers = [],
    stopped = false;
  const cycle = () => {
    if (stopped) return;
    timers = DEMO_SCRIPT.map(([delay, person, text, extra]) =>
      setTimeout(() => onMessage(demoMessage(person, text, ++sequence, extra, channel)), delay),
    );
    timers.push(setTimeout(cycle, 64000));
  };
  cycle();
  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
  };
}
