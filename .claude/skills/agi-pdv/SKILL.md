---
name: agi-pdv
description: Como o agi pdv funciona e como mantê-lo. Use em qualquer alteração, correção, tela nova, regra nova, integração ou dúvida sobre o projeto agi pdv (ponto de venda React + Fastify + PostgreSQL).
---

# agi pdv

Ponto de venda para pequeno comércio brasileiro, uma empresa por instalação. Monorepo com npm workspaces:

```
apps/api   Node 22 + Fastify 5 + Zod + Kysely + PostgreSQL 16
apps/web   React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + Recharts + lucide-react
brand/     logos e tokens.css (fonte única de cores, fonte e raios)
docs/      especificacao.md, api.md, design-system.md, TUTORIAL.md, CONFIGURACOES.md, PENDENCIAS.md, CLEAN-ROOM.md
site/      landing page estática
```

## Regras que não mudam

1. **Clean room.** O agi pdv foi escrito do zero a partir de `docs/especificacao.md`. Nunca abra, copie ou consulte o código do Hórus PDV nem de outro PDV. Comportamento novo é escrito primeiro na especificação, com palavras próprias, e só depois implementado.
2. **Simples primeiro.** O dono quer um sistema fácil de usar, ensinar e aprender. Antes de adicionar campo, passo ou tela, pergunte se dá para resolver com menos. Campo opcional é melhor que obrigatório; um clique é melhor que dois.
3. **Dinheiro em centavos inteiros**, sempre, da API ao front. Formatar como R$ só na exibição.
4. **Permissão é checada na API.** Esconder um botão no front não basta.
5. **Toda alteração grava auditoria** (quem, quando, o quê) e nada é apagado de verdade (exclusão lógica).

## Onde mexer

| Quero... | Arquivos |
|---|---|
| Regra de negócio | `docs/especificacao.md` → `apps/api/src/modulos/<modulo>/servico.ts` |
| Rota nova | `apps/api/src/modulos/<modulo>/{rotas,esquemas,servico}.ts` + documentar em `docs/api.md` |
| Tabela ou coluna | migração nova em `apps/api/src/db/migracoes/` (nunca edite uma migração já aplicada) + `npm run db:migrar` |
| Tela | `apps/web/src/paginas/<modulo>/` + rota em `apps/web/src/App.tsx` + item da sidebar em `apps/web/src/componentes/layout/` |
| Chamada à API no front | `apps/web/src/api/` |
| Componente reutilizável | `apps/web/src/componentes/ui/` |
| Cor, fonte, raio, sombra | `brand/tokens.css` (copiar para `apps/web/src/estilos/tokens.css`) + `docs/design-system.md` |
| Modo loja (API serve apps/web/dist) | `apps/api/src/app.ts` |
| App de Windows (Electron, banco embutido na porta 54329, backup diário, menus) | `desktop/src/main.ts`; empacote com `npm run instalador` (rodar no Windows) |
| Configuração da loja | tabela de configurações (migração) + tela Configurações + `docs/CONFIGURACOES.md` |

Os módulos da API são: auditoria, auth, autorizacoes, caixa, categorias, clientes, configuracoes, dashboard, devolucoes, empresa, entradas, estoque, fornecedores, inventarios, produtos, relatorios, sistema, usuarios, vales e vendas.

## Roteiro de qualquer mudança

1. Escreva ou ajuste a regra em `docs/especificacao.md`, incluindo o critério de aceite na seção 8.
2. API: migração (se precisar), serviço, esquema Zod, rota, teste Vitest em `apps/api`.
3. Atualize `docs/api.md` com o formato JSON exato.
4. Front: tela ou componente seguindo o design system.
5. Textos novos passam pelas regras de texto (abaixo).
6. Rode `npm run build` e `npm test`. Se mexeu em tela, rode também `npx playwright test` em `apps/web` (grava no banco de demonstração; nunca aponte para o banco da loja) e confira as capturas em `docs/capturas/`.
7. Atualize `docs/TUTORIAL.md`, `docs/CONFIGURACOES.md` ou `docs/PENDENCIAS.md` se a mudança aparecer para o usuário, criar configuração ou resolver uma pendência.

## Design system (resumo; detalhe em docs/design-system.md)

- Use só classes semânticas: `bg-fundo`, `bg-superficie`, `bg-superficie-2`, `bg-selecao`, `bg-veu`, `text-texto`, `text-texto-2`, `text-texto-3`, `border-borda`, `bg-primaria`, `text-sobre-primaria`, `text-destaque`. Nunca hexadecimal em componente; é isso que mantém os dois temas funcionando (classe `.dark` no `<html>`).
- Identidade preta e dourada. Tema escuro é o padrão: preto `#0B0B0C`, grafite `#1A1A1C`, primária dourada `#D4AF37`. No claro: fundo creme `#F2ECE1`, primária preta, destaque em dourado escuro `#7A5C0E` (o dourado normal não tem contraste no creme). O dourado aparece pouco.
- `.card-destaque` e `.card-escuro` são sempre escuros; dentro deles use `text-creme`, `text-creme-2`, `text-ouro-claro`.
- Fontes locais via @fontsource: Geist no texto, Inter Tight nos títulos (`font-titulo`), JetBrains Mono em atalhos e rótulos (`font-mono`), Instrument Serif itálico só na tela de acesso (`font-serifa`). Números de dinheiro, quantidade e hora com a classe `tabular`.
- Cards com raio de 18px; sombra suave no claro, filete de 1px no escuro. Botões em pílula, campos com raio de 12px, altura de 44px (48px no caixa).
- Status em pílula com fundo suave (ok, aviso, erro, info), com par claro e escuro. Vermelho sólido só em ação destrutiva.
- Logo: componente `Logo` (símbolo `agi-simbolo.png` + "agi" 800 e "pdv" 300 dourado). Nome sempre `agi pdv`, minúsculo. Nada com ".hub".
- A frente de caixa é tela cheia, sem sidebar, com os atalhos (F2, F3, F4, F6, F8, F9, Esc, 1 a 5) em chips no rodapé.

## Regras de texto

Português do Brasil, frases curtas, palavras do comércio. O botão diz o que faz ("Finalizar venda"). O erro diz o que fazer ("Informe a quantidade"). O estado vazio indica o próximo passo. Sem exclamação, sem emoji, sem "Ops", sem tom de propaganda. Termos fixos: caixa, venda, vale-troca, sangria, suprimento, fundo de troco, entrada de mercadoria.

Para textos maiores (README, landing, ajuda), aplique a skill **humanizer** (github.com/blader/humanizer): sem contrastes "não é X, é Y", sem tríades forçadas, sem frase de efeito no fim do parágrafo, sem palavras infladas, sem travessão em excesso.

## Comandos

```bash
npm install
npm run db:local                 # PostgreSQL portátil na pasta .banco (padrão, sem Docker)
npm run db:up                    # alternativa: Postgres no Docker (mesma porta; use um ou outro)
npm run db:migrar
npm run db:semente -- --limpar   # loja de exemplo (APAGA o banco)
npm run dev                      # API :3333 + web :5173
npm test                         # testes da API (banco agipdv_test)
npm run build
npm run admin:senha -- email     # senha temporária para o admin
npm run loja                     # build + migração + liga em :3333 (API serve as telas)
npm run iniciar                  # liga o modo loja sem rebuild
npm run backup                   # backups/agipdv-AAAA-MM-DD-HHMM.agipdv.gz via COPY (src/db/copia.ts), guarda 30
npm run restaurar -- arquivo     # pede confirmação; troca todos os dados
npm run instalador               # (Windows) gera instalador/agi-pdv-Setup-<versão>.exe
# Lançar versão: suba "version" no package.json da raiz, commit, git tag vX.Y.Z, git push origin vX.Y.Z
# (o workflow .github/workflows/instalador.yml gera o .exe num Windows do GitHub e publica em Releases)
```

No Windows: `ferramentas/iniciar-agipdv.bat` (abre banco portátil + sistema em duas janelas), `ferramentas/agendar-backup.bat` (backup diário às 22h no Agendador de Tarefas).

Segredos ficam em `.env` (raiz: AGI_SENHA_BANCO) e `apps/api/.env` (DATABASE_URL, SEGREDO_SESSAO); nunca vão para o git.

Logins da semente: admin@agipdv.local / Admin@123, gerente@agipdv.local / Gerente@123, caixa@agipdv.local / Caixa@123.

## Antes de dar por pronto

- [ ] Especificação atualizada
- [ ] Build e testes passando
- [ ] Tela conferida nos temas claro e escuro
- [ ] Textos revisados pelas regras de texto
- [ ] Docs do usuário atualizados (tutorial, configurações, pendências)
