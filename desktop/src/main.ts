// NEXO PDV para Windows: liga o banco embutido e o sistema, e abre a janela.
// Os dados ficam em %APPDATA%\NexoPDV e os backups em Documentos\NEXO PDV\backups.
import { app, BrowserWindow, Menu, dialog, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, createWriteStream } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip, gunzipSync } from 'node:zlib';
import net from 'node:net';

const PORTA_SISTEMA = 3333;
const PORTA_BANCO = 54329;
const MANTER_BACKUPS = 30;
const aqui = dirname(fileURLToPath(import.meta.url));

app.setName('NEXO PDV');
app.setPath('userData', join(app.getPath('appData'), 'NexoPDV'));
const pastaDados = app.getPath('userData');
const pastaBanco = join(pastaDados, 'banco');
const pastaBackups = join(app.getPath('documents'), 'NEXO PDV', 'backups');
mkdirSync(pastaDados, { recursive: true });
mkdirSync(pastaBackups, { recursive: true });

type Ajustes = { senhaBanco: string; segredo: string; ultimoBackup?: string };
const arquivoAjustes = join(pastaDados, 'ajustes.json');
function lerAjustes(): Ajustes {
  if (existsSync(arquivoAjustes)) return JSON.parse(readFileSync(arquivoAjustes, 'utf8'));
  const novo = { senhaBanco: randomBytes(16).toString('hex'), segredo: randomBytes(32).toString('hex') };
  writeFileSync(arquivoAjustes, JSON.stringify(novo, null, 2));
  return novo;
}
const salvarAjustes = (a: Ajustes) => writeFileSync(arquivoAjustes, JSON.stringify(a, null, 2));
const ajustes = lerAjustes();
const urlBanco = `postgres://postgres:${ajustes.senhaBanco}@localhost:${PORTA_BANCO}/nexo`;

// A API lê estas variáveis ao ser carregada, por isso vêm antes do import dela.
Object.assign(process.env, {
  NODE_ENV: 'production',
  DATABASE_URL: urlBanco,
  PORTA: String(PORTA_SISTEMA),
  HOST: '0.0.0.0',
  SEGREDO_SESSAO: ajustes.segredo,
  ORIGEM_WEB: `http://localhost:${PORTA_SISTEMA}`,
  NIVEL_LOG: 'warn',
  NEXO_PASTA_WEB: join(aqui, 'web'),
});

let janela: BrowserWindow | null = null;
let sair = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bancoEmbutido: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let servidor: any = null;
let api: typeof import('./api-entrada.js') | null = null;

const telaCarregando = (texto: string) =>
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(`<!doctype html><html><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b1510;color:#e8f1ec;font-family:system-ui">
  <div style="text-align:center"><div style="font-size:28px;font-weight:800">NEXO <span style="font-weight:500;color:#7c9286">PDV</span></div>
  <p style="color:#a9bdb2">${texto}</p></div></body></html>`);

function portaLivre(porta: number): Promise<boolean> {
  return new Promise((ok) => {
    const s = net.createServer().once('error', () => ok(false)).once('listening', () => s.close(() => ok(true)));
    s.listen(porta, '0.0.0.0');
  });
}

async function ligarBanco() {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  bancoEmbutido = new EmbeddedPostgres({
    databaseDir: pastaBanco,
    user: 'postgres',
    password: ajustes.senhaBanco,
    port: PORTA_BANCO,
    persistent: true,
    onLog: () => {},
    onError: () => {},
  });
  if (!existsSync(join(pastaBanco, 'PG_VERSION'))) await bancoEmbutido.initialise();
  await bancoEmbutido.start();
  const existe = await bancoEmbutido.getPgClient('postgres');
  await existe.connect();
  const r = await existe.query("select 1 from pg_database where datname = 'nexo'");
  if (!r.rowCount) await existe.query('create database nexo');
  await existe.end();
}

async function ligarSistema() {
  api = await import('./api-entrada.js');
  const db = api.criarBanco(urlBanco);
  try {
    await api.migrarBanco(db);
  } finally {
    await db.destroy();
  }
  servidor = await api.construirApp();
  await servidor.listen({ port: PORTA_SISTEMA, host: '0.0.0.0' });
}

async function fazerBackup(avisar: boolean) {
  if (!api) return;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const destino = join(pastaBackups, `nexo-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.nexo.gz`);
  try {
    const gz = createGzip();
    const arq = createWriteStream(destino);
    gz.pipe(arq);
    await api.gerarBackup(urlBanco, gz);
    await new Promise<void>((ok, erro) => { arq.on('finish', ok); arq.on('error', erro); gz.end(); });
    const antigos = readdirSync(pastaBackups).filter((f) => /^nexo-.*\.nexo\.gz$/.test(f)).sort().reverse().slice(MANTER_BACKUPS);
    for (const f of antigos) rmSync(join(pastaBackups, f));
    ajustes.ultimoBackup = d.toISOString();
    salvarAjustes(ajustes);
    if (avisar) dialog.showMessageBox(janela!, { type: 'info', message: 'Backup feito.', detail: destino });
  } catch (e) {
    rmSync(destino, { force: true });
    if (avisar) dialog.showErrorBox('O backup falhou', String((e as Error).message ?? e));
  }
}

// Backup automático: um por dia, conferido a cada hora e ao fechar.
function precisaBackup() {
  if (!ajustes.ultimoBackup) return true;
  return Date.now() - new Date(ajustes.ultimoBackup).getTime() > 20 * 3600 * 1000;
}

async function restaurar() {
  if (!api || !janela) return;
  const escolha = await dialog.showOpenDialog(janela, {
    title: 'Escolha o backup',
    defaultPath: pastaBackups,
    filters: [{ name: 'Backup do NEXO', extensions: ['gz'] }],
    properties: ['openFile'],
  });
  if (escolha.canceled || !escolha.filePaths[0]) return;
  const ok = await dialog.showMessageBox(janela, {
    type: 'warning',
    buttons: ['Cancelar', 'Restaurar'],
    defaultId: 0,
    cancelId: 0,
    message: 'Trocar todos os dados atuais pelos do backup?',
    detail: 'Antes disso, o NEXO faz um backup dos dados de agora, por segurança.',
  });
  if (ok.response !== 1) return;
  await fazerBackup(false);
  try {
    await servidor?.close();
    await api.fecharBanco();
    await api.restaurarBackup(urlBanco, gunzipSync(readFileSync(escolha.filePaths[0])));
    app.relaunch();
    sair = true;
    app.quit();
  } catch (e) {
    dialog.showErrorBox('A restauração falhou', String((e as Error).message ?? e));
  }
}

function enderecosNaRede() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${PORTA_SISTEMA}`);
}

function montarMenu() {
  const iniciaComWindows = app.getLoginItemSettings().openAtLogin;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Arquivo',
        submenu: [
          { label: 'Fazer backup agora', click: () => fazerBackup(true) },
          { label: 'Abrir pasta de backups', click: () => shell.openPath(pastaBackups) },
          { label: 'Restaurar backup...', click: () => restaurar() },
          { type: 'separator' },
          {
            label: 'Abrir junto com o Windows',
            type: 'checkbox',
            checked: iniciaComWindows,
            click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
          },
          { type: 'separator' },
          { label: 'Sair', accelerator: 'Alt+F4', click: () => janela?.close() },
        ],
      },
      {
        label: 'Exibir',
        submenu: [
          { label: 'Recarregar', role: 'reload' },
          { label: 'Tela cheia', role: 'togglefullscreen' },
          { type: 'separator' },
          { label: 'Aumentar', role: 'zoomIn' },
          { label: 'Diminuir', role: 'zoomOut' },
          { label: 'Tamanho normal', role: 'resetZoom' },
        ],
      },
      {
        label: 'Loja',
        submenu: [
          {
            label: 'Endereço para os outros caixas',
            click: () => {
              const ends = enderecosNaRede();
              dialog.showMessageBox(janela!, {
                type: 'info',
                message: 'Nos outros computadores da loja, abra no navegador:',
                detail: (ends.length ? ends.join('\n') : 'Este computador não está em nenhuma rede.') +
                  '\n\nEste computador precisa ficar com o NEXO aberto. Se o Windows perguntar sobre o firewall, permita o acesso em redes privadas.',
              });
            },
          },
          { label: 'Abrir no navegador', click: () => shell.openExternal(`http://localhost:${PORTA_SISTEMA}`) },
        ],
      },
      {
        label: 'Ajuda',
        submenu: [
          { label: 'Tutorial', click: () => shell.openExternal('https://github.com/thiagopfreire160/nexo-pdv/blob/main/docs/TUTORIAL.md') },
          { label: 'Abrir pasta de dados', click: () => shell.openPath(pastaDados) },
          { type: 'separator' },
          { label: `Sobre o NEXO PDV ${app.getVersion()}`, click: () => dialog.showMessageBox(janela!, { message: `NEXO PDV ${app.getVersion()}`, detail: 'Ponto de venda para pequeno comércio. Licença MIT.' }) },
        ],
      },
    ]),
  );
}

async function desligarTudo() {
  if (precisaBackup()) await fazerBackup(false).catch(() => {});
  await servidor?.close().catch(() => {});
  await api?.fecharBanco().catch(() => {});
  await bancoEmbutido?.stop().catch(() => {});
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (janela) { if (janela.isMinimized()) janela.restore(); janela.focus(); }
  });

  app.whenReady().then(async () => {
    montarMenu();
    janela = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 1024,
      minHeight: 640,
      title: 'NEXO PDV',
      icon: join(aqui, 'icon.png'),
      backgroundColor: '#0b1510',
      autoHideMenuBar: false,
      show: false,
    });
    janela.maximize();
    janela.show();
    janela.loadURL(telaCarregando('Ligando o banco de dados...'));
    janela.webContents.setWindowOpenHandler(({ url }) => {
      // Recibos e impressões abrem em janela própria; links externos vão para o navegador.
      if (url.startsWith(`http://localhost:${PORTA_SISTEMA}`) || url === 'about:blank') return { action: 'allow' };
      shell.openExternal(url);
      return { action: 'deny' };
    });

    janela.on('close', async (ev) => {
      if (sair) return;
      ev.preventDefault();
      const r = await dialog.showMessageBox(janela!, {
        type: 'question',
        buttons: ['Continuar usando', 'Fechar o NEXO'],
        defaultId: 0,
        cancelId: 0,
        message: 'Fechar o NEXO PDV?',
        detail: 'Os outros caixas da loja que usam este computador também param de funcionar.',
      });
      if (r.response === 1) {
        sair = true;
        janela?.loadURL(telaCarregando('Guardando os dados e desligando...'));
        await desligarTudo();
        app.quit();
      }
    });

    try {
      if (!(await portaLivre(PORTA_SISTEMA))) {
        throw new Error(`A porta ${PORTA_SISTEMA} já está em uso. Feche outra cópia do NEXO (ou o npm run dev) e abra de novo.`);
      }
      await ligarBanco();
      janela.loadURL(telaCarregando('Ligando o sistema...'));
      await ligarSistema();
      await janela.loadURL(`http://localhost:${PORTA_SISTEMA}`);
      if (precisaBackup()) fazerBackup(false);
      setInterval(() => { if (precisaBackup()) fazerBackup(false); }, 3600 * 1000);
    } catch (e) {
      dialog.showErrorBox('O NEXO PDV não conseguiu ligar', String((e as Error).message ?? e));
      sair = true;
      await bancoEmbutido?.stop().catch(() => {});
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());
}

