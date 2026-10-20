document.documentElement.classList.add('js');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Each chapter's words rise in as it pins and drift out as the next one arrives. The camera
// move itself lives in world.js; this only stages the type.
const chapters = [...document.querySelectorAll('[data-stop]')];
const parts = chapters.map(chapter => [...chapter.querySelectorAll('.line, .sync, .hero > *, .zen > *, .foot, .hint')]);
function stage() {
  const vh = innerHeight;
  chapters.forEach((chapter, i) => {
    const { top, height } = chapter.getBoundingClientRect();
    const f = -top / (height - vh); // 0 when the pin starts, 1 when it ends
    const enter = i === 0 ? 1 : Math.min(1, Math.max(0, (f + 0.35) / 0.35));
    const leave = i === chapters.length - 1 ? 1 : Math.min(1, Math.max(0, (1.15 - f) / 0.35));
    parts[i].forEach((el, n) => {
      const k = Math.min(1, Math.max(0, enter * (1 + n * 0.12) - n * 0.12)) * leave;
      el.style.opacity = k;
      el.style.transform = reduceMotion.matches ? '' : `translateY(${(1 - k) * 28}px)`;
    });
  });
}
let queued = false;
addEventListener('scroll', () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; stage(); });
}, { passive: true });
addEventListener('resize', stage);
stage();

// The sync card counts down to the next poll, the way the app's worker does: every 20 seconds.
const clock = document.querySelector('[data-sync-clock]');
let next = 20;
setInterval(() => {
  if (document.hidden) return;
  next = next <= 1 ? 20 : next - 1;
  clock.textContent = next === 20 ? 'synced just now' : `next in ${next} s`;
}, 1000);

// Download links default to the latest release page. When GitHub answers, they point straight at
// that release's DMG and the note names its version, so a new release needs no edit here.
fetch('https://api.github.com/repos/AmmarJ23/Orbit/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
  .then(response => response.ok ? response.json() : Promise.reject(response.status))
  .then(release => {
    const dmg = release.assets?.find(asset => asset.name.endsWith('.dmg'));
    if (dmg) document.querySelectorAll('[data-download]').forEach(link => { link.href = dmg.browser_download_url; });
    const version = release.tag_name?.replace(/^v/, '');
    if (version) document.querySelectorAll('[data-version]').forEach(el => { el.textContent = version; });
  })
  .catch(() => {}); // the release page links already work
