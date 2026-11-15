---
name: nexo-pdv
description: Como o NEXO PDV funciona e como mantê-lo. Use em qualquer alteração, correção, tela nova, regra nova, integração ou dúvida sobre o projeto NEXO PDV (ponto de venda React + Fastify + PostgreSQL).
---

# NEXO PDV

Ponto de venda para pequeno comércio brasileiro, uma empresa por instalação. Monorepo com npm workspaces:

```
apps/api   Node 22 + Fastify 5 + Zod + Kysely + PostgreSQL 16
apps/web   React 19 + Vite + TypeScript + Tailwind v4 + TanStack Query + Recharts + lucide-react
brand/     logos e tokens.css (fonte única de cores, fonte e raios)
docs/      especificacao.md, api.md, design-system.md, TUTORIAL.md, CONFIGURACOES.md, PENDENCIAS.md, CLEAN-ROOM.md
site/      landing page estática
```

## Regras que não mudam

1. **Clean room.** O NEXO foi escrito do zero a partir de `docs/especificacao.md`. Nunca abra, copie ou consulte o código do Hórus PDV nem de outro PDV. Comportamento novo é escrito primeiro na especificação, com palavras próprias, e só depois implementado.
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

- Use só classes semânticas: `bg-fundo`, `bg-superficie`, `bg-superficie-2`, `text-texto`, `text-texto-2`, `text-texto-3`, `border-borda`, `bg-primaria`, `text-destaque`. Nunca hexadecimal em componente; é isso que mantém o tema escuro funcionando (classe `.dark` no `<html>`).
- Primária verde-floresta `#1f5e3b` (no escuro, broto `#2fd657`). O verde do logo `#00ca28` é acento de gráficos e indicadores.
- Plus Jakarta Sans. Números de dinheiro, quantidade e hora com a classe `tabular`.
- Cards brancos com raio de 20px e sombra suave, sem borda. Campos e botões com raio de 12px e altura de 44px (48px no caixa).
- Status em pílula com fundo suave (ok, aviso, erro, info). Vermelho sólido só em ação destrutiva.
- Logo: `nexo-logo-claro.png` em fundo claro, `nexo-logo-escuro.png` em fundo escuro.
- A frente de caixa é tela cheia, sem sidebar, com os atalhos (F2, F3, F4, F6, F8, F9, Esc, 1 a 5) em chips no rodapé.

## Regras de texto

Português do Brasil, frases curtas, palavras do comércio. O botão diz o que faz ("Finalizar venda"). O erro diz o que fazer ("Informe a quantidade"). O estado vazio indica o próximo passo. Sem exclamação, sem emoji, sem "Ops", sem tom de propaganda. Termos fixos: caixa, venda, vale-troca, sangria, suprimento, fundo de troco, entrada de mercadoria.

Para textos maiores (README, landing, ajuda), aplique a skill **humanizer** (github.com/blader/humanizer): sem contrastes "não é X, é Y", sem tríades forçadas, sem frase de efeito no fim do parágrafo, sem palavras infladas, sem travessão em excesso.

## Comandos

```bash
npm install
npm run db:up                    # Postgres no Docker
npm run db:migrar
npm run db:semente -- --limpar   # loja de exemplo (APAGA o banco)
npm run dev                      # API :3333 + web :5173
npm test                         # testes da API (banco nexo_test)
npm run build
npm run admin:senha -- email     # senha temporária para o admin
npm run loja                     # build + migração + liga em :3333 (API serve as telas)
npm run iniciar                  # liga o modo loja sem rebuild
npm run backup                   # backups/nexo-AAAA-MM-DD-HHMM.sql.gz (guarda 30)
npm run restaurar -- arquivo     # pede confirmação; troca todos os dados
```

No Windows: `ferramentas/iniciar-nexo.bat` (liga tudo), `ferramentas/agendar-backup.bat` (backup diário às 22h no Agendador de Tarefas).

Segredos ficam em `.env` (raiz: NEXO_SENHA_BANCO) e `apps/api/.env` (DATABASE_URL, SEGREDO_SESSAO); nunca vão para o git.

Logins da semente: admin@nexo.local / Admin@123, gerente@nexo.local / Gerente@123, caixa@nexo.local / Caixa@123.

## Antes de dar por pronto

- [ ] Especificação atualizada
- [ ] Build e testes passando
- [ ] Tela conferida nos temas claro e escuro
- [ ] Textos revisados pelas regras de texto
- [ ] Docs do usuário atualizados (tutorial, configurações, pendências)
