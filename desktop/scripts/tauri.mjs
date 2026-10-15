import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const tools = resolve(desktop, '../.tools');
const env = { ...process.env };
const arguments_ = process.argv.slice(2);
const forceDemo = arguments_.includes('--demo');
const forceLive = arguments_.includes('--live');
const args = arguments_.filter(arg => arg !== '--demo' && arg !== '--live');
const mode = args[0] === 'dev' ? 'development' : 'production';
const configured = forceDemo ? 'true' : forceLive ? 'false' : loadEnv(mode, desktop, 'VITE_ORBIT_').VITE_ORBIT_DEMO ?? 'false';
if ((forceDemo && forceLive) || !['true', 'false'].includes(configured) || args.some(arg => arg.startsWith('--features'))) {
  throw new Error('Use VITE_ORBIT_DEMO=true/false or --demo/--live to select matching frontend and native modes.');
}
env.VITE_ORBIT_DEMO = configured;
if (['dev', 'build'].includes(args[0]) && configured === 'true') {
  args.push('--features', 'demo', '--config', resolve(desktop, 'src-tauri/tauri.demo.conf.json'));
}
const cargo = resolve(tools, 'cargo');
const rustup = resolve(tools, 'rustup');
// Use the project-local toolchain when installed; otherwise use normal system Rust.
if (existsSync(resolve(cargo, 'bin/cargo'))) {
  env.CARGO_HOME = cargo;
  env.RUSTUP_HOME = rustup;
  env.PATH = `${resolve(cargo, 'bin')}${delimiter}${env.PATH}`;
}
const cli = resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, ...args], {
  cwd: desktop,
  env,
  stdio: 'inherit',
});
child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
