import { hash } from './voices.js';
import { timingFrame } from './visemes.js';

const PALETTE = ['#c5cda5', '#f3ae8f', '#b8b8e2', '#a4cfca', '#f1cf85'];
function characterSVG(variant) {
  const ears = [
    '<path d="M42 60 34 17 73 43M106 43 144 17 138 65" class="fur"/>',
    '<ellipse cx="58" cy="36" rx="14" ry="31" class="fur"/><ellipse cx="119" cy="36" rx="14" ry="31" class="fur"/>',
    '<circle cx="42" cy="48" r="20" class="fur"/><circle cx="137" cy="48" r="20" class="fur"/>',
    '<path d="M66 32 70 12 88 25 107 10 113 33" fill="#f8d78c" stroke="#292a25" stroke-width="4"/>',
    '<path d="M52 42 44 25M127 42 136 25" fill="none" stroke="var(--actor-color)" stroke-width="11" stroke-linecap="round"/><circle cx="43" cy="20" r="7" fill="#f6d08a"/><circle cx="137" cy="20" r="7" fill="#f6d08a"/>',
  ][variant % 5];
  return `<svg viewBox="0 0 180 200" role="img" aria-label="A little chat character"><ellipse class="shadow" cx="90" cy="187" rx="60" ry="8"/>${ears}<path class="fur body" d="M38 126Q23 163 36 178Q55 192 90 181Q126 192 146 178Q158 164 142 126Z"/><ellipse cx="90" cy="156" rx="30" ry="22" fill="#fff" opacity=".2"/><path d="M36 146 22 155M144 146 158 155" stroke="var(--actor-color)" stroke-width="15" stroke-linecap="round"/><path class="fur" d="M33 88Q28 36 90 36Q153 36 147 88L151 111Q147 140 90 141Q31 140 29 111Z"/><g class="face"><g class="eyes" fill="#292a25"><ellipse cx="63" cy="89" rx="5.5" ry="8"/><ellipse cx="117" cy="89" rx="5.5" ry="8"/></g><ellipse cx="47" cy="107" rx="10" ry="6" fill="#e99a94" opacity=".65"/><ellipse cx="133" cy="107" rx="10" ry="6" fill="#e99a94" opacity=".65"/><ellipse class="mouth" cx="90" cy="112" rx="8" ry="3" fill="#402e32"/><path class="smile" d="M80 109Q90 121 100 109" fill="none" stroke="#402e32" stroke-width="3" stroke-linecap="round"/></g><path d="M52 182 51 189M126 182 127 189" stroke="#292a25" stroke-width="7" stroke-linecap="round"/></svg>`;
}
export class Stage {
  constructor(document) {
    this.document = document;
    this.cast = document.querySelector('#cast');
    this.bubble = document.querySelector('#bubble');
    this.caption = document.querySelector('#caption');
    this.actors = new Map();
    this.active = null;
    this.frame = null;
    this.spans = [];
  }
  enter(item) {
    let actor = this.actors.get(item.userId);
    if (!actor) {
      if (this.actors.size >= 5) this.leave(this.actors.keys().next().value);
      const element = this.document.createElement('div');
      element.className = 'actor';
      element.style.setProperty('--actor-color', item.color || PALETTE[hash(item.userId) % 5]);
      element.style.setProperty('--idle-delay', `${-(hash(item.userId) % 50) / 10}s`);
      element.innerHTML = characterSVG(hash(item.userId) % 5);
      const tag = this.document.createElement('div');
      tag.className = 'name-tag';
      tag.textContent = item.name;
      element.append(tag);
      this.cast.append(element);
      actor = { element, item };
      this.actors.set(item.userId, actor);
    } else {
      // Refresh recency without reshuffling the visible seats.
      this.actors.delete(item.userId);
      this.actors.set(item.userId, actor);
      actor.item = item;
      actor.element.querySelector('.name-tag').textContent = item.name;
      if (item.color) actor.element.style.setProperty('--actor-color', item.color);
    }
    return actor;
  }
  leave(userId) {
    const actor = this.actors.get(userId);
    if (!actor) return;
    actor.element.classList.add('leaving');
    this.actors.delete(userId);
    setTimeout(() => actor.element.remove(), 260);
  }
  seed() {
    for (const [i, name] of ['miso_moon', 'peachy', 'pixelpal', 'mossclub', 'sunny_side'].entries())
      this.enter({ userId: `seed-${i}`, name, color: PALETTE[i] });
  }
  start(item, audio, handle) {
    this.end();
    this.active = item;
    const actor = this.enter(item);
    actor.element.classList.add('speaking');
    this.bubble.classList.add('is-speaking');
    this.document.querySelector('#speaker-name').textContent = item.name;
    this.document.querySelector('#speaker-language').textContent = item.language.toUpperCase();
    this.document.querySelector('#speaker-voice').textContent =
      `${item.voice.name} · ${audio.timing ? 'PHONEME SYNC' : 'NO TIMING'}`;
    this.caption.replaceChildren();
    this.spans = Array.from(item.text).map((char) => {
      const span = this.document.createElement('span');
      span.textContent = char;
      this.caption.append(span);
      return span;
    });
    this.caption.lang = item.language;
    let previous = -1;
    const animate = () => {
      if (this.active !== item) return;
      const elapsed = handle.elapsed();
      const frame = timingFrame(
        audio.timing,
        elapsed,
        item.voice.pitch,
        Array.from(item.spokenText).length,
        audio.duration,
      );
      actor.element.dataset.viseme = frame.viseme;
      const offset = item.readNames ? Array.from(`${item.name}: `).length : 0;
      const highlighted = Math.max(0, frame.highlight - offset);
      if (highlighted !== previous) {
        this.spans.forEach((span, i) => span.classList.toggle('spoken', i < highlighted));
        previous = highlighted;
      }
      this.document.querySelector('#speech-progress').style.width = `${frame.progress * 100}%`;
      this.frame = requestAnimationFrame(animate);
    };
    animate();
  }
  end() {
    if (this.frame) cancelAnimationFrame(this.frame);
    for (const { element } of this.actors.values()) {
      element.classList.remove('speaking');
      element.dataset.viseme = 'rest';
    }
    if (this.active) {
      this.spans.forEach((span) => span.classList.add('spoken'));
      this.document.querySelector('#speech-progress').style.width = '100%';
    }
    this.bubble.classList.remove('is-speaking');
    this.active = null;
  }
  remove(predicate) {
    if (this.active && predicate(this.active)) this.end();
    for (const [id, actor] of this.actors) if (predicate(actor.item)) this.leave(id);
    // Do not leave deleted text in the bubble after moderation.
    if (this.lastItem && predicate(this.lastItem)) this.resetBubble();
  }
  resetBubble() {
    this.caption.textContent = 'The stage is yours. Say hello in chat.';
    this.document.querySelector('#speaker-name').textContent = 'Ready when you are';
    this.document.querySelector('#speaker-language').textContent = 'LIVE';
    this.document.querySelector('#speaker-voice').textContent = '';
    this.document.querySelector('#speech-progress').style.width = '0%';
    this.lastItem = null;
  }
}
