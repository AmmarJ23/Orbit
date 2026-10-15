import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const tools = resolve(desktop, '../.tools');
const env = { ...process.env };
const cargo = resolve(tools, 'cargo');
const rustup = resolve(tools, 'rustup');
// Use the project-local toolchain when installed; otherwise use normal system Rust.
if (existsSync(resolve(cargo, 'bin/cargo'))) {
  env.CARGO_HOME = cargo;
  env.RUSTUP_HOME = rustup;
  env.PATH = `${resolve(cargo, 'bin')}${delimiter}${env.PATH}`;
}
const cli = resolve(desktop, 'node_modules/@tauri-apps/cli/tauri.js');
const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
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
