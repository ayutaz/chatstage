import { DEFAULTS, readOptions, overlayURL } from './config.js';
const form = document.querySelector('#setup');
const preview = document.querySelector('#preview');
const mode = document.querySelector('#preview-mode');
const output = document.querySelector('#overlay-url');
const status = document.querySelector('#copy-status');
let debounce;
try {
  const saved = readOptions(
    new URLSearchParams(JSON.parse(localStorage.getItem('chatstage:setup') || '{}')),
  );
  for (const key of Object.keys(DEFAULTS)) {
    const field = form.elements.namedItem(key);
    if (field) {
      if (field.type === 'checkbox') field.checked = saved[key];
      else field.value = saved[key];
    }
  }
} catch {
  /* Storage is optional. */
}
function getOptions() {
  const data = new URLSearchParams(new FormData(form));
  data.set('readNames', form.elements.readNames.checked ? '1' : '0');
  return readOptions(data);
}
function update(reload = true) {
  const options = getOptions();
  document.querySelector('#volume-value').textContent = `${Math.round(options.volume * 100)}%`;
  output.value = options.channel ? overlayURL(location.href, { ...options, demo: false }) : '';
  const demoURL = overlayURL(location.href, { ...options, demo: true });
  document.querySelector('#open-demo').href = demoURL;
  if (reload) {
    const url = new URL(
      mode.value === 'live' ? overlayURL(location.href, { ...options, demo: false }) : demoURL,
    );
    url.searchParams.set('preview', '1');
    if (preview.src !== url.href) preview.src = url.href;
  }
  const saved = Object.fromEntries(
    new URLSearchParams(new URL(overlayURL(location.href, options)).search),
  );
  try {
    localStorage.setItem('chatstage:setup', JSON.stringify(saved));
  } catch {
    /* Storage is optional. */
  }
}
form.addEventListener('input', (event) => {
  status.textContent = 'Your overlay, ready in one link.';
  if (event.target.name === 'volume') {
    update(false);
    preview.contentWindow?.postMessage(
      { type: 'chatstage:volume', volume: getOptions().volume },
      location.origin,
    );
    return;
  }
  clearTimeout(debounce);
  debounce = setTimeout(() => update(), 500);
});
mode.addEventListener('change', () => update());
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearTimeout(debounce);
  update(false);
  if (!getOptions().channel) {
    status.textContent = 'Enter a valid Twitch channel name first.';
    form.elements.channel.focus();
    return;
  }
  try {
    await navigator.clipboard.writeText(output.value);
    status.textContent = 'Copied! Add this URL to your OBS Browser Source.';
  } catch {
    output.focus();
    output.select();
    status.textContent = 'Select the URL below and copy it with Ctrl+C (or ⌘C).';
  }
});
update();
