# agi pdv: troca de nome e identidade visual

Data: 2026-11-18

## Intenção

O dono escreveu o NEXO PDV e quer que ele passe a ser o **agi pdv**, com a estética preta e dourada descrita em `IDENTIDADE.md`. O sistema continua o mesmo: telas, regras, API e banco. Mudam a aparência e o nome, em todo o repositório. Nenhuma loja usa a v1.0.0, então não é preciso manter compatibilidade com nada que tenha o nome NEXO.

## Objetivos

- Nenhum "NEXO" ou "Nexo" sobra no repositório, nem em texto visível nem em identificadores internos. A única exceção é a URL do GitHub (ver Restrições).
- Todas as telas (web, app do Windows, site, comprovante na tela) seguem a paleta, as fontes e a forma da identidade.
- A marca na tela é o **símbolo dourado** (`simbolo-dourado.png`) ao lado do nome **agi pdv** escrito em texto.

## Fora do escopo

- Mudar o layout, os fluxos ou o comportamento das telas. A estrutura (sidebar, cards, KPIs, caixa em tela cheia) continua a mesma.
- Renomear o repositório no GitHub ou a pasta local `nexo-pdv`.
- Mudar o comprovante impresso, que é preto no branco, em Courier, para impressora térmica. Muda só o nome escrito nele.

## Anti-objetivos (seria falha mesmo funcionando)

- Usar qualquer material com ".hub": `logo-escuro.png`, o mockup `Logo_design_for_agilize.hub_*.jpg` ou o nome agilize.hub nas telas.
- Tornar o caixa mais difícil de ler: dourado espalhado, serifada itálica em número, contraste baixo.
- Status (ok, aviso, erro) perderem o sentido de cor.
- Quebrar o tema claro ou deixar cor em hexadecimal dentro de componente.
- Exigir internet para carregar fontes na loja.

## Restrições

- O repositório e a pasta continuam com o nome `nexo-pdv`. Os links para `github.com/thiagopfreire160/nexo-pdv` (menu Tutorial do app, README, workflow, site) **continuam apontando para lá**. É a única ocorrência de "nexo" que fica.
- As fontes vêm de pacotes `@fontsource` (hoje `@fontsource-variable/plus-jakarta-sans` em `apps/web`), porque a loja pode estar sem internet. O site estático pode usar Google Fonts.
- A regra do design system continua: os componentes usam só classes semânticas (`bg-fundo`, `bg-superficie`, `text-texto`, `bg-primaria`...). As cores ficam em `brand/tokens.css`, copiado para `apps/web/src/estilos/tokens.css`.
- Os textos novos seguem as regras de texto da skill do projeto e a seção Voz da identidade.
- Antes de dar por pronto: `npm run build`, `npm test` e `npx playwright test` em `apps/web` (banco de demonstração), com as capturas conferidas nos temas claro e escuro.

## Abordagens consideradas

1. **Trocar os tokens e retocar as telas com cor própria** (escolhida). Os valores de `tokens.css` mudam, as cores fixas que restam (`floresta-*`, `broto-*`, `text-white`, `.card-destaque`, o degradê em `app.css`) passam a usar tokens, e as peças de marca são refeitas à mão. Depois vêm a troca de nome e a atualização de docs e capturas. A estrutura das telas fica a mesma do NEXO.
2. **Redesenhar o layout junto**, com linguagem editorial. Descartada: dá várias vezes mais trabalho, arrisca fluxos que já funcionam e piora a leitura no caixa.
3. **Só trocar os tokens.** Descartada: o card verde, a tela de login, a janela do Windows e o site têm cor fixa e continuariam com cara de NEXO.

O dono escolheu a 1.

## Decisões do dono

- Nome: **agi pdv**.
- Do material enviado, só o símbolo é reaproveitado. Nada que traga ".hub" entra.
- Mesmo repositório, mesma pasta. Todo o conteúdo do repositório muda de nome.
- Não há instalação em uso: os nomes internos também mudam, sem migração.

## Decisões minhas (o dono pode corrigir)

### Nome escrito

- Em texto corrido e nas telas: **agi pdv**, tudo minúsculo, como a identidade faz com o nome da agência.
- Na marca da tela: "agi" em Inter Tight 800, cor `texto`; "pdv" em Inter Tight 300, cor `destaque` (dourado). O contraste de peso imita o "agilize" + ".hub" sem usar o hub.
- Identificador técnico: `agi-pdv` (pacote npm, pasta da skill), `agipdv` onde hífen não cabe (nome do banco, prefixos), `AgiPDV` em pastas do Windows, `AGI_` em variáveis de ambiente.

### Tema

- O padrão passa a ser **escuro** (hoje segue o sistema operacional). A escolha do usuário continua salva e o claro continua disponível.
- Escuro: fundo `#0B0B0C`, superfície `#1A1A1C`, superfície 2 um degrau acima (`#222225`), borda `rgba(242,236,225,.09)`, texto `#F2ECE1` / `#B8B2A6` / um terceiro tom mais apagado (`#8A857B`), primária `#D4AF37` com texto preto por cima, hover `#F1D78A`, destaque `#D4AF37`.
- Claro: fundo creme `#F2ECE1`, superfície um creme mais claro (`#FAF7F1`), texto `#0B0B0C` e tons de cinza quente, primária preta (`#0B0B0C`) com texto creme, destaque `#7A5C0E` (dourado escuro, porque o dourado normal não tem contraste no creme).
- Todo par texto/fundo novo precisa de contraste 4,5:1 ou mais. Os tons que não estão na identidade (superfície 2, texto 3, os do claro) ficam a critério de quem constrói, dentro dessa regra.

### Status

Verde, âmbar, vermelho e azul continuam, com fundos escurecidos no tema escuro para não brilharem sobre o preto. O azul de "info" fica mais neutro, porque a identidade proíbe o "azul tecnologia". Vermelho sólido continua só em ação destrutiva.

### Tipografia (no sistema)

- Texto e interface: **Geist** (300 a 600), no lugar da Plus Jakarta.
- Títulos de página e de card: **Inter Tight** (700 a 800, letter-spacing negativo leve).
- Rótulos, atalhos (chips F2, F3...), legendas de KPI e metadados: **JetBrains Mono**, maiúsculo, espaçado. Usar com moderação.
- Dinheiro, quantidade e hora continuam com a classe `tabular` em Geist.
- **Instrument Serif itálico e Archivo expandido** aparecem só no site e no título da tela de login, nunca dentro do sistema.

### Forma

- Raio de card 18 px (`--raio` da identidade). Campos e botões: botões em pílula, campos com 12 px. A altura continua 44 px (48 px no caixa).
- No escuro, os cards têm filete de 1 px (`--linha`) em vez de sombra. No claro fica uma sombra suave.
- Halo dourado radial bem fraco no card de destaque do dashboard e na tela de login. O grão de filme fica só no site.

### Peças retocadas à mão

- **Logo** (`componentes/ui/Logo.tsx`): símbolo + "agi pdv" como descrito acima. O mesmo símbolo dourado serve nos dois temas. A versão preta do símbolo fica para o fundo dourado (favicon claro, se fizer sentido).
- **Login** (`paginas/acesso/LayoutAcesso.tsx`): painel preto com halo dourado, frase curta em Inter Tight com uma palavra em Instrument Serif itálico dourado. O texto final segue a seção Voz.
- **Card de destaque do dashboard**: grafite com halo dourado no canto, número em creme, seta em círculo dourado.
- **Gráficos (Recharts)**: área em degradê dourado que desbota para baixo, rosca em dourado + grafite.
- **Frente de caixa**: total em creme, botão de pagamento em dourado com texto preto, chips de atalho em JetBrains Mono.
- **Sidebar**: o item ativo ganha a barrinha de 3 px em dourado.
- **App do Windows** (`desktop/src/main.ts`): tela de abertura preta com símbolo e nome. Cor de fundo da janela `#0B0B0C`. Ícone do instalador gerado a partir do símbolo.
- **Site** (`site/index.html`): troca completa para a identidade (Archivo, Inter Tight, Instrument Serif, grão), com novas capturas em `site/img`. A estrutura das seções continua.
- `theme-color` do `index.html`: `#0B0B0C`.

### Arquivos de marca

- O `simbolo-dourado.png` tem halo branco no recorte. Limpar o recorte (remover pixels claros semitransparentes da borda) sem redesenhar a forma. Gerar `brand/agi-simbolo-dourado.png`, `brand/agi-simbolo-preto.png` e os ícones de 32, 64, 192 e 512 px. Para o favicon, considerar o símbolo dourado sobre quadrado preto arredondado, porque fica legível em aba clara e escura.
- Apagar todos os `nexo-*` de `brand/`, `apps/web/public/marca/` e `site/img/`. Os três arquivos enviados que estão soltos na raiz (`logo-escuro.png`, `simbolo-dourado.png`, o mockup `.jpg`) ficam onde estão e não entram no git. Só a cópia tratada do símbolo vai para `brand/`. Mover ou apagar os originais é decisão do dono.
- Ícone `.ico` do instalador gerado a partir do símbolo (ver `desktop/build`).

### Troca de nome (lista do que muda)

| Hoje | Passa a ser |
|---|---|
| `NEXO PDV`, `NEXO` em textos, docs, títulos, menus, diálogos | `agi pdv` |
| `package.json` `name: nexo-pdv` | `agi-pdv` |
| banco `nexo` / `nexo_test`, senha padrão `nexo` | `agipdv` / `agipdv_test`, senha padrão `agipdv` |
| `NEXO_SENHA_BANCO`, `NEXO_PASTA_WEB` | `AGI_SENHA_BANCO`, `AGI_PASTA_WEB` |
| cookie `nexo_sessao` | `agipdv_sessao` |
| cabeçalho `X-Nexo-Csrf` | `X-Agi-Csrf` |
| chaves `nexo-tema`, `nexo-venda-andamento`, `nexo-terminal` | `agipdv-tema`, `agipdv-venda-andamento`, `agipdv-terminal` |
| backup `nexo-AAAA-MM-DD-HHMM.nexo.gz`, cabeçalho `NEXO-BACKUP 1` | `agipdv-AAAA-MM-DD-HHMM.agipdv.gz`, `AGIPDV-BACKUP 1` |
| `%APPDATA%\NexoPDV`, `Documentos\NEXO PDV\backups` | `%APPDATA%\AgiPDV`, `Documentos\agi pdv\backups` |
| instalador `NEXO-PDV-Setup-<versão>.exe`, appId do Electron | `agi-pdv-Setup-<versão>.exe`, appId novo |
| `ferramentas/iniciar-nexo.bat` | `ferramentas/iniciar-agipdv.bat` |
| logins da semente `@nexo.local` | `@agipdv.local` |
| skill `.claude/skills/nexo-pdv/` | `.claude/skills/agi-pdv/`, conteúdo atualizado (design system novo) |
| `docker-compose.yml`, `infra/criar-banco-teste.sql`, workflow do instalador | nomes acima |

Os testes que conferem esses nomes (por exemplo `apps/web/testes/*.spec.ts`, `apps/api/test/ajudantes.ts`) mudam junto.

Os arquivos `.env` locais do dono (que não vão para o git) também precisam das variáveis novas. O banco portátil local em `.banco` tem o banco `nexo`: recriar (`db:local` + `db:migrar` + `db:semente -- --limpar`) ou renomear com `ALTER DATABASE`. Avisar o dono antes de mexer no banco local.

### Documentos

- `docs/design-system.md`: reescrito com os tokens, fontes e regras novas.
- `docs/especificacao.md`, `api.md` (cabeçalho CSRF, cookie), `TUTORIAL.md`, `CONFIGURACOES.md`, `PENDENCIAS.md`, `TESTE-IMPRESSORA.md`, `README.md`, `CLAUDE.md`, `AGENTS.md`: nome trocado.
- `docs/CLEAN-ROOM.md`: nome trocado. A regra de clean room continua igual.
- `docs/capturas/` e `site/previas/`: regeradas pelo Playwright.
- `IDENTIDADE.md` é da agência e fica na raiz como referência. Ela não é documentação do produto.

## Deixado para quem constrói

- Os tons exatos que a identidade não define (superfície 2, texto 3, status, tema claro), dentro da regra de contraste.
- A técnica de limpeza do PNG, desde que não altere a forma do símbolo.
- A ordem dos commits. Sugestão: tokens e fontes → peças de marca → troca de nome → site → docs e capturas.
