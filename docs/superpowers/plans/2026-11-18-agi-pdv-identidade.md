# agi pdv: identidade e nome — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o NEXO PDV por agi pdv em todo o repositório e aplicar a identidade preta e dourada sem mudar comportamento.

**Architecture:** As cores vivem em `brand/tokens.css` (cópia em `apps/web/src/estilos/tokens.css`) como variáveis semânticas com valor para claro e `.dark`. Os componentes deixam de usar as escalas `floresta-*`/`broto-*` e `text-white` e passam a usar tokens semânticos novos. A troca de nome é mecânica, seguindo a tabela do design.

**Tech Stack:** React 19, Tailwind v4, Recharts, Fastify, Kysely, Electron, @fontsource.

**Spec:** `docs/superpowers/specs/2026-11-18-agi-pdv-identidade-design.md`

## Global Constraints

- Nome em texto: `agi pdv` (minúsculo). Identificadores: `agi-pdv`, `agipdv`, `AgiPDV`, `AGI_`.
- Única ocorrência de "nexo" permitida: URLs `github.com/thiagopfreire160/nexo-pdv` e o nome da pasta/repo.
- Nada com ".hub" nem o nome agilize.hub nas telas, docs do produto ou site.
- Componentes só com classes semânticas; hexadecimal só em `tokens.css`, `app.css`, impressão (`utils/impressao.ts`, `utils/code128.ts`) e no HTML inline do Electron.
- Fontes servidas por `@fontsource` (loja sem internet). Site pode usar Google Fonts.
- Contraste de texto ≥ 4,5:1 nos dois temas.
- Regras de texto: frases curtas, sem exclamação, sem emoji, sem travessão longo, sem "não é X, é Y".

## Review Focus

1. Card de destaque (total do caixa, modal de pagamento, trocas, produtos, dashboard) no **tema claro**: precisa continuar escuro com texto creme legível. Conferir nas capturas `caixa-claro.png`, `caixa-pagamento-claro.png`.
2. Pílulas de status no **tema escuro**: fundo escuro com texto claro, não pílula clara brilhando sobre o preto.
3. Usuário que já tinha `nexo-tema` salvo: some (chave nova), cai no padrão escuro. Aceito, pois não há instalação.
4. Botão primário no claro (preto com texto creme) e no escuro (dourado com texto preto): foco visível (`outline` usa `--primaria`).
5. Electron: `backgroundColor` e tela de carregando sem flash verde.

---

### Task 1: Arquivos de marca

**Files:**
- Create: `brand/agi-simbolo.png` (símbolo dourado limpo, fundo transparente), `brand/agi-simbolo-preto.png`, `brand/agi-icone-{32,64,192,512}.png` (símbolo dourado sobre quadrado `#0B0B0C` com raio de 22%), `desktop/build/icon.png` (512), `desktop/build/icon.ico` (16, 32, 48, 256, entradas PNG).
- Copy: `apps/web/public/marca/` recebe `agi-simbolo.png` e `agi-icone-*.png`; `site/img/` recebe `agi-simbolo.png` e `agi-icone-32.png`, `agi-icone-192.png`.
- Delete: `brand/nexo-*`, `apps/web/public/marca/nexo-*`, `site/img/nexo-*`.
- Não tocar: `logo-escuro.png`, `simbolo-dourado.png`, `Logo_design_*.jpg` na raiz (ficam fora do git).

- [ ] **Step 1:** Script PowerShell/System.Drawing (no scratchpad) lê `simbolo-dourado.png`, zera o alfa de pixels claros e pouco saturados (azul > 200 e |r-b| < 60), recorta à caixa do conteúdo com 4% de margem e salva `agi-simbolo.png`. A forma não muda.
- [ ] **Step 2:** Versão preta: mesma máscara de alfa, RGB `#0B0B0C`.
- [ ] **Step 3:** Ícones e `.ico` (ICO com PNGs embutidos).
- [ ] **Step 4:** Conferir visualmente `agi-simbolo.png` sobre preto e sobre creme: sem halo branco.
- [ ] **Step 5:** Commit "Arquivos de marca do agi pdv".

### Task 2: Tokens, fontes e CSS base

**Files:** `brand/tokens.css`, `apps/web/src/estilos/tokens.css` (cópia idêntica), `apps/web/src/estilos/app.css`, `apps/web/src/main.tsx`, `apps/web/package.json`.

**Produces (classes que as Tasks 3 e 4 usam):** `bg-selecao` (fundo de item selecionado/ícone suave), `bg-veu` (fundo de modal), `text-creme`, `text-creme-2`, `bg-creme`, `text-ouro`, `text-ouro-claro`, `bg-ouro`, `bg-preto`, `bg-grafite`, `font-titulo`, `font-mono`, `font-serifa`, `.card-destaque` e `.card-escuro` (sempre escuros, texto creme), `.ondas` (curvas douradas fracas), status `bg-ok-bg`/`text-ok-fg` etc. com valor por tema.

- [ ] **Step 1:** `@theme`: cores fixas `preto #0B0B0C`, `grafite #1A1A1C`, `ouro #D4AF37`, `ouro-claro #F1D78A`, `ouro-escuro #7A5C0E`, `creme #F2ECE1`, `creme-2 #B8B2A6`; remover `floresta-*` e `broto-*`. `--radius-card: 18px`. Fontes: `--font-sans: "Geist Variable", "Geist", ui-sans-serif, system-ui, sans-serif`; `--font-titulo: "Inter Tight Variable", ...`; `--font-mono: "JetBrains Mono Variable", ui-monospace, monospace`; `--font-serifa: "Instrument Serif", serif`. Sem `@import` do Google Fonts.
- [ ] **Step 2:** Variáveis semânticas (status passam para `@theme inline` com variáveis):

| var | claro | escuro |
|---|---|---|
| fundo | #F2ECE1 | #0B0B0C |
| superficie | #FAF7F1 | #1A1A1C |
| superficie-2 | #ECE5D8 | #222225 |
| texto | #0B0B0C | #F2ECE1 |
| texto-2 | #4A453D | #B8B2A6 |
| texto-3 | #6E685E | #8A857B |
| borda | #E0D8C8 | #2A2927 |
| primaria | #0B0B0C | #D4AF37 |
| primaria-hover | #2A2A2D | #F1D78A |
| sobre-primaria | #F2ECE1 | #0B0B0C |
| destaque | #7A5C0E | #D4AF37 |
| selecao | #EBE0C8 | #2A261B |
| veu | rgb(11 11 12 / .45) | rgb(0 0 0 / .6) |
| ok bg/fg | #E3F1E6 / #1E6B3A | #15251A / #7FD39A |
| aviso bg/fg | #F7ECD2 / #7A5200 | #2B2312 / #E9C46A |
| erro bg/fg | #F8E1E2 / #A8222D | #2E1517 / #F08A92 |
| info bg/fg | #E8E4DC / #4A453D | #26252A / #CFC9BD |

  `--color-erro: #C8323E`. Sombra do card: só no claro; no escuro, `box-shadow: inset 0 0 0 1px rgb(242 236 225 / .09)` via `--shadow-card`.
- [ ] **Step 3:** `app.css`: `.card-destaque` e `.card-escuro` = `radial-gradient(circle at 100% 0%, rgb(212 175 55 / .22), transparent 45%), linear-gradient(160deg, #1F1F22 0%, #141416 60%, #0B0B0C 100%)`, `color: #F2ECE1`, filete `inset 0 0 0 1px rgb(212 175 55 / .14)`. `.ondas` usa `rgb(212 175 55 / .06)` e `/.045`. Fonte local das famílias no comentário.
- [ ] **Step 4:** `package.json` do web: trocar `@fontsource-variable/plus-jakarta-sans` por `@fontsource-variable/geist`, `@fontsource-variable/inter-tight`, `@fontsource-variable/jetbrains-mono`, `@fontsource/instrument-serif`. `main.tsx` importa os quatro (instrument-serif: `400-italic.css`).
- [ ] **Step 5:** Commit "Tokens e fontes da identidade agi pdv".

### Task 3: Componentes e telas sem cor fixa

**Files:** os listados por `git grep -nE "floresta|broto|text-white|bg-white" apps/web/src` (LayoutApp, Botao, BuscaProduto, Campo, Card, Estados, Modal, Pagina, Tabela, AberturaCaixa, FrenteCaixa, ModalBusca, ModalCliente, ModalPagamento, Configuracoes, Dashboard, Estoque, Produtos, Relatorios, Trocas, Usuarios, LayoutAcesso).

**Consumes:** classes da Task 2.

Mapa de troca:

| Hoje | Passa a ser |
|---|---|
| `bg-floresta-50 dark:bg-superficie-2`, `bg-floresta-50` (seleção, ícone suave) | `bg-selecao` |
| `hover:bg-floresta-50`, `dark:hover:bg-floresta-900/60` | `hover:bg-selecao` |
| `bg-floresta-950/40`, `/45`, `/35` (véu) | `bg-veu` |
| dentro de `.card-destaque`/`.card-escuro`: `text-white` → `text-creme`; `text-white/NN` → `text-creme/NN`; `text-floresta-100` → `text-creme-2`; `text-broto-300` → `text-ouro-claro`; `bg-white/NN` → `bg-creme/NN` | |
| `bg-broto-500 text-floresta-950` (botão do card de ajuda) | `bg-ouro text-preto hover:bg-ouro-claro` |
| `bg-broto-500/20 text-broto-300` (pílula do relógio) | `bg-ouro/15 text-ouro-claro` |
| avatares `bg-floresta-100 text-floresta-700 dark:bg-floresta-800 dark:text-floresta-100` | `bg-selecao text-destaque` |
| `hover:border-floresta-300` | `hover:border-destaque/50` |
| `bg-white text-floresta-800` (botão redondo no card escuro) | `bg-ouro text-preto` |
| `bg-white text-floresta-700` (botão no card destaque) | `bg-creme text-preto` |
| `text-white` em `bg-primaria` | `text-sobre-primaria` |
| `text-white` em `bg-erro` | mantém `text-white` (vermelho sólido) |
| `bg-white` do interruptor (`Campo.tsx:186`) e iframe da prévia do recibo | mantém (papel/knob) |

- [ ] **Step 1:** Aplicar o mapa.
- [ ] **Step 2:** Dashboard: cores do gráfico por forma de pagamento: dinheiro `var(--color-ouro)`, crédito `var(--texto)`, débito `var(--color-ouro-claro)`, pix `var(--texto-2)`, vale_troca `var(--texto-3)` (manter as chaves existentes; conferir quais existem). Área: stroke `var(--destaque)`, gradiente `var(--destaque)` 0.28 → 0. Cursor `var(--borda)`.
- [ ] **Step 3:** Conferir: `git grep -nE "floresta|broto" apps/web/src` vazio.
- [ ] **Step 4:** Commit "Telas usam só tokens da identidade".

### Task 4: Peças de marca no web

**Files:** `apps/web/src/componentes/ui/Logo.tsx`, `apps/web/src/paginas/acesso/LayoutAcesso.tsx`, `apps/web/src/ganchos/useTema.tsx`, `apps/web/index.html`, `apps/web/src/componentes/ui/Pagina.tsx` (título), `apps/web/src/componentes/ui/Card.tsx` (título), `apps/web/src/componentes/layout/LayoutApp.tsx` (item ativo, chips), `apps/web/src/paginas/caixa/FrenteCaixa.tsx` (chips de atalho).

- [ ] **Step 1:** `Logo({ tamanho = 36, mostrarNome = true, sempreEscuro = false })` mantém a assinatura. `<img src="/marca/agi-simbolo.png">`; nome `font-titulo text-[20px] tracking-[-0.03em]`: "agi" 800 (`text-texto` ou `text-creme` se `sempreEscuro`), "pdv" 300 (`text-destaque` ou `text-ouro`). `aria-label="agi pdv"`.
- [ ] **Step 2:** Login: título `font-titulo` 300+800 com uma palavra em `font-serifa italic text-ouro-claro`, texto: "Venda, confira o caixa e veja o *resultado* do dia." Rodapé "agi pdv · comprovante não fiscal" em `font-mono uppercase tracking-[0.14em] text-[11px]`.
- [ ] **Step 3:** `useTema`: chave `agipdv-tema`; padrão `'escuro'` quando nada salvo; remover a troca de favicon claro/escuro (ícone único).
- [ ] **Step 4:** `index.html`: favicons `/marca/agi-icone-32.png` e `-192.png`, `theme-color #0B0B0C`, `<title>agi pdv</title>`, script lê `agipdv-tema` e aplica `.dark` se ausente ou `escuro` ou (`sistema` e SO escuro).
- [ ] **Step 5:** Títulos: h1 do `CabecalhoPagina` e título de `Card` com `font-titulo`. Chips de atalho (`Atalho`/`kbd`) e legendas de KPI com `font-mono`. Barrinha do item ativo da sidebar `bg-destaque`.
- [ ] **Step 6:** Commit "Logo, login e tema escuro padrão".

### Task 5: Nome na API, CLI e infraestrutura

**Files:** `apps/api/src/app.ts`, `config.ts`, `cli/{backup,restaurar,banco-local,semente,redefinir-senha-admin}.ts`, `db/copia.ts`, `apps/api/test/ajudantes.ts`, `apps/api/.env.example`, `.env.example`, `docker-compose.yml`, `infra/criar-banco-teste.sql`, `package.json` (raiz e workspaces: `name`, `description`), `ferramentas/*.bat` (renomear `iniciar-nexo.bat` → `iniciar-agipdv.bat`).

Valores fixos (do design): banco `agipdv`/`agipdv_test`, senha padrão `agipdv`, `AGI_SENHA_BANCO`, `AGI_PASTA_WEB`, cookie `agipdv_sessao`, cabeçalho `x-agi-csrf`, backup `agipdv-AAAA-MM-DD-HHMM.agipdv.gz` com regex `/^agipdv-.*\.(agipdv|sql)\.gz$/`, cabeçalho de arquivo `AGIPDV-BACKUP 1`, erro "Este arquivo não é um backup do agi pdv.", semente `admin@agipdv.local`, `gerente@agipdv.local`, `caixa@agipdv.local`.

- [ ] **Step 1:** Trocar. Testes Vitest que usam o cabeçalho/cookie/e-mails seguem a constante (`CABECALHO_CSRF`) ou são atualizados.
- [ ] **Step 2:** Commit "API e ferramentas com o nome agi pdv".

### Task 6: Nome no web e nos testes E2E

**Files:** `apps/web/src/api/cliente.ts` (`X-Agi-Csrf`), `paginas/caixa/vendaLocal.ts` (`agipdv-venda-andamento`, `agipdv-terminal`), `componentes/layout/LayoutApp.tsx`, `paginas/ajuda/Ajuda.tsx`, `apps/web/testes/*.spec.ts`, `apps/web/package.json`.

- [ ] **Step 1:** Trocar textos para "agi pdv" e chaves acima.
- [ ] **Step 2:** Commit "Telas e testes com o nome agi pdv".

### Task 7: App do Windows e publicação

**Files:** `desktop/src/main.ts`, `desktop/empacotar.mjs`, `.github/workflows/instalador.yml`, `desktop/package.json` se houver.

- [ ] **Step 1:** `app.setName('agi pdv')`, `userData` em `AgiPDV`, backups em `Documentos\agi pdv\backups`, banco `agipdv`, nomes de backup da Task 5, textos dos diálogos com "agi pdv", `backgroundColor '#0B0B0C'`. Tela de carregando: fundo `#0B0B0C`, "agi" 800 creme + "pdv" 300 `#D4AF37`, texto `#B8B2A6`.
- [ ] **Step 2:** `empacotar.mjs`: `name 'agi-pdv'`, `productName 'agi pdv'`, `appId 'br.agipdv.app'`, `shortcutName 'agi pdv'`, `artifactName 'agi-pdv-Setup-${version}.exe'`. Workflow: `agi-pdv-Setup*.exe`, release "agi pdv". Link do tutorial no GitHub continua `nexo-pdv`.
- [ ] **Step 3:** Commit "App do Windows como agi pdv".

### Task 8: Site

**Files:** `site/index.html`, `site/img/*`.

- [ ] **Step 1:** Reaplicar a identidade: Google Fonts (Archivo com `wdth` 125, Inter Tight, Instrument Serif itálico, Geist, JetBrains Mono), tokens da IDENTIDADE.md, título de impacto com uma palavra em serifada dourada, grão sutil, cantos 18 px, botões em pílula. Seções e textos mantidos, nome trocado. Imagens apontam para as capturas novas (`site/img/*.webp`, regeradas na Task 10).
- [ ] **Step 2:** Commit "Site com a identidade agi pdv".

### Task 9: Documentação e skill

**Files:** `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/*.md`, `.claude/skills/nexo-pdv/` → `.claude/skills/agi-pdv/SKILL.md`.

- [ ] **Step 1:** `docs/design-system.md` reescrito com a tabela da Task 2, fontes, forma e o mapa de classes da Task 3.
- [ ] **Step 2:** Nome trocado nos demais. `docs/api.md`: cabeçalho e cookie novos. Skill: `name: agi-pdv`, resumo do design system novo, comandos e logins novos.
- [ ] **Step 3:** Conferir: `git grep -in nexo -- ':!docs/superpowers'` só retorna URLs do GitHub.
- [ ] **Step 4:** Commit "Docs e skill do agi pdv".

### Task 10: Verificação (precisa de Node 22)

- [ ] **Step 1:** `npm install` (atualiza `package-lock.json` com as fontes novas).
- [ ] **Step 2:** `npm run db:local` (banco novo `agipdv`), `.env` com `AGI_SENHA_BANCO`, `npm run db:migrar`, `npm run db:semente -- --limpar`.
- [ ] **Step 3:** `npm run build` e `npm test`: tudo verde.
- [ ] **Step 4:** `npx playwright test` em `apps/web`; conferir `docs/capturas/` claro e escuro contra a Review Focus; converter as capturas usadas no site para `site/img/*.webp`.
- [ ] **Step 5:** Commit "Capturas e lockfile".
