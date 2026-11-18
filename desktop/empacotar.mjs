// Gera o instalador do Windows: npm run instalador (rode no Windows).
// Resultado: instalador/agi-pdv-Setup-<versão>.exe
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const palco = join(aqui, '.empacotar');
const saida = join(raiz, 'instalador');
const rodar = (cmd, cwd = raiz) => execSync(cmd, { cwd, stdio: 'inherit', shell: true });

const versao = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version;
const depsApi = JSON.parse(readFileSync(join(raiz, 'apps/api/package.json'), 'utf8')).dependencies;
// Pacotes com binários próprios: ficam fora do bundle e são instalados no app.
const nativos = ['embedded-postgres', '@node-rs/argon2', 'sharp'];

console.log('1/4 Gerando as telas...');
rodar('npm run build -w apps/web');

console.log('2/4 Juntando o código do app...');
rmSync(palco, { recursive: true, force: true });
mkdirSync(palco, { recursive: true });
await build({
  entryPoints: [join(aqui, 'src/main.ts')],
  outfile: join(palco, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['electron', 'pg-native', ...nativos, '@embedded-postgres/*', '@img/*'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'warning',
});
cpSync(join(raiz, 'apps/web/dist'), join(palco, 'web'), { recursive: true });
copyFileSync(join(aqui, 'build/icon.png'), join(palco, 'icon.png'));
mkdirSync(join(palco, 'build'), { recursive: true });
copyFileSync(join(aqui, 'build/icon.ico'), join(palco, 'build/icon.ico'));
copyFileSync(join(raiz, 'LICENSE'), join(palco, 'LICENSE'));

writeFileSync(
  join(palco, 'package.json'),
  JSON.stringify(
    {
      name: 'agi-pdv',
      productName: 'agi pdv',
      version: versao,
      description: 'agi pdv: ponto de venda para pequeno comércio',
      author: 'Thiago Pereira',
      license: 'MIT',
      main: 'main.mjs',
      type: 'module',
      dependencies: Object.fromEntries(nativos.map((n) => [n, depsApi[n]])),
      devDependencies: { electron: '45.3.2', 'electron-builder': '26.18.0' },
      build: {
        appId: 'br.agipdv.app',
        productName: 'agi pdv',
        copyright: 'Copyright (c) 2026 Thiago Pereira',
        asar: false,
        directories: { output: 'dist', buildResources: 'build' },
        files: ['main.mjs', 'web/**', 'icon.png', 'LICENSE', 'package.json', 'node_modules/**'],
        win: { target: [{ target: 'nsis', arch: ['x64'] }], icon: 'build/icon.ico' },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowToChangeInstallationDirectory: true,
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
          shortcutName: 'agi pdv',
          artifactName: 'agi-pdv-Setup-${version}.exe',
          installerLanguages: ['pt_BR'],
          language: '1046',
          deleteAppDataOnUninstall: false,
          license: 'LICENSE',
        },
      },
    },
    null,
    2,
  ),
);

console.log('3/4 Instalando o Electron e os componentes do banco (demora na primeira vez)...');
rodar('npm install --no-audit --no-fund --no-workspaces', palco);

console.log('4/4 Criando o instalador...');
rodar('npx electron-builder --win --publish never', palco);

mkdirSync(saida, { recursive: true });
for (const f of readdirSync(join(palco, 'dist'))) {
  if (f.endsWith('.exe')) {
    copyFileSync(join(palco, 'dist', f), join(saida, f));
    console.log(`\nPronto: instalador/${f}`);
  }
}
