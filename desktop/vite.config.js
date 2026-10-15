import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const demo = loadEnv(mode, process.cwd(), 'VITE_ORBIT_').VITE_ORBIT_DEMO === 'true';
  return { plugins: [{ name: 'orbit-build-surface', transformIndexHtml(html) {
    return html.replace(/<!-- (demo|live):start -->([\s\S]*?)<!-- \1:end -->/g,
      (_, surface, content) => (surface === 'demo') === demo ? content : '')
      .replaceAll('__ORBIT_MODE__', demo ? 'DEMO' : 'REDMINE');
  } }] };
});
