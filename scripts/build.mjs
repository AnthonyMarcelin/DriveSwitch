import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIcons } from './generate-icons.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

function prepareDist() {
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  mkdirSync(join(dist, 'icons'), { recursive: true });
  mkdirSync(join(dist, '_locales/fr'), { recursive: true });

  generateIcons(join(root, 'icons'));
  generateIcons(join(dist, 'icons'));

  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  manifest.background.service_worker = 'background.js';
  delete manifest.background.type;
  manifest.action.default_popup = 'popup.html';
  manifest.content_scripts = [
    {
      matches: manifest.content_scripts[0].matches,
      js: ['content.js'],
      run_at: 'document_idle',
    },
  ];
  writeFileSync(join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2));

  cpSync(join(root, 'src/popup/popup.html'), join(dist, 'popup.html'));
  cpSync(join(root, 'src/popup/popup.css'), join(dist, 'popup.css'));
  cpSync(join(root, '_locales'), join(dist, '_locales'), { recursive: true });
}

const common = {
  bundle: true,
  format: 'iife',
  target: ['chrome109', 'firefox109', 'safari16'],
  logLevel: 'info',
  sourcemap: true,
};

async function build() {
  prepareDist();

  const ctx = await esbuild.context({
    ...common,
    entryPoints: {
      background: join(root, 'src/background/service-worker.js'),
      content: join(root, 'src/content/bridge.js'),
      popup: join(root, 'src/popup/popup.js'),
    },
    outdir: dist,
  });

  if (watch) {
    await ctx.watch();
    console.log('Watching… chargez le dossier dist/ dans le navigateur.');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build OK → dist/');
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
