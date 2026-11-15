# Design system do NEXO PDV

Fonte única dos tokens: `brand/tokens.css`. Nunca escreva cor em hexadecimal num componente. Use as classes semânticas (`bg-superficie`, `text-texto-2`, `bg-primaria`...). É isso que faz o tema escuro funcionar sem retrabalho.

## Marca

- **Logo para fundo claro:** `brand/nexo-logo-claro.png` (o "N" fica verde-floresta).
- **Logo para fundo escuro:** `brand/nexo-logo-escuro.png` (o "N" fica branco).
- Ícones prontos em 32, 64, 192 e 512 px (`brand/nexo-claro-*.png`, `brand/nexo-escuro-*.png`).
- O nome sempre aparece como **NEXO PDV**: "NEXO" em peso 800, "PDV" em peso 500 e na cor `text-texto-3`.
- Espaço livre em volta do logo: pelo menos 1/4 da largura dele.

## Cores

| Papel | Claro | Escuro | Onde usar |
|---|---|---|---|
| Fundo da página | `#f2f5f3` | `#0b1510` | atrás de tudo |
| Superfície (cards, sidebar) | `#ffffff` | `#13211a` | blocos de conteúdo |
| Superfície 2 | `#f6f8f7` | `#182a20` | campos, linhas alternadas, hover |
| Primária | floresta `#1f5e3b` | broto `#2fd657` | botão principal, item ativo do menu |
| Destaque | broto `#00ca28` | broto `#2fd657` | gráficos, indicadores, badges de número |
| Texto | `#14201a` / `#4d5d55` / `#7a8a82` | `#e8f1ec` / `#a9bdb2` / `#7c9286` | título / corpo / legenda |

Status sempre em pílula com fundo suave e texto escuro: **ok** (verde), **aviso** (âmbar), **erro** (vermelho), **info** (azul). Vermelho sólido (`erro`) só aparece em ação destrutiva: cancelar venda, excluir.

## Tipografia

Plus Jakarta Sans em tudo.

| Uso | Tamanho / peso |
|---|---|
| Título da página | 28px / 700 |
| Título de card | 16px / 600 |
| Número de KPI | 36px / 700, `tabular` |
| Corpo | 14px / 400–500 |
| Legenda | 12px / 500, `text-texto-3` |
| Total do caixa | 48px / 800, `tabular` |

Todo valor em dinheiro, quantidade ou hora usa a classe `tabular`, para que os números fiquem alinhados.

## Forma

- Cards: `rounded-[var(--radius-card)]` (20px), `bg-superficie`, `shadow-[var(--shadow-card)]`, padding de 20 a 24px, sem borda.
- Campos e botões: raio de 12px e altura de 44px (48px no caixa).
- Pílulas e badges: raio total.
- Espaçamento em múltiplos de 4px. O vão entre cards é de 16px (20px em telas grandes).

## Layout

- **Sidebar** fixa à esquerda, com 248px, em `bg-superficie`, separada do fundo por 12px de margem e com cantos arredondados (fica "flutuando"). Os itens estão agrupados em *Menu* e *Geral*. O item ativo ganha fundo `floresta-50` (no escuro, `superficie-2`), texto `primaria` e uma barrinha de 3px à esquerda. No pé da sidebar fica um card de ajuda.
- **Barra superior** dentro de um card: busca global à esquerda; à direita, botão de tema, notificações e avatar com nome e perfil.
- **Cabeçalho da página**: título e uma frase curta à esquerda; ações à direita (primária preenchida, secundária com contorno).
- **Dashboard**: a primeira linha tem 4 KPIs, e o primeiro é o card de destaque (`.card-destaque`, gradiente verde, com seta num círculo no canto). Abaixo vêm o gráfico de área (verde com gradiente que desbota para baixo), um card de lembrete/atalho e uma lista lateral. Na última linha ficam uma tabela curta, uma rosca (donut) de progresso e um card escuro de relógio do caixa.
- **Frente de caixa**: tela própria, sem sidebar, para dar o máximo de espaço. À esquerda ficam a busca e a lista de itens; à direita, o painel de total (48px) com os botões de pagamento. Os atalhos de teclado aparecem como chips no rodapé.
- No celular, a sidebar vira uma gaveta. O caixa é pensado para tela a partir de 1024px.

## Componentes base

`Botao` (primario, contorno, fantasma, perigo; tamanhos md e lg; estado carregando), `Campo` (rótulo acima, ajuda e erro abaixo), `CampoDinheiro`, `CampoDocumento` (CPF/CNPJ com máscara e validação), `Selecao`, `Card`, `CardKpi`, `Pilula`, `Tabela` (cabeçalho fixo, paginação, estado vazio), `Gaveta` (formulário lateral de cadastro), `Modal`, `Confirmacao`, `Toast`, `EstadoVazio`, `Esqueleto`, `Atalho` (chip de tecla).

Ícones: `lucide-react`, com 18px e traço 1.75.

## Gráficos

Recharts. A série principal usa a cor `destaque` com área em gradiente (40% → 0%). Séries extras: floresta-600, floresta-300 e âmbar. Sem grade vertical, com grade horizontal tracejada em `borda`. Tooltip em card.

## Texto da interface

Português do Brasil, frases curtas, sem jargão. O botão diz o que faz ("Finalizar venda", não "Confirmar"). Mensagem de erro diz o que fazer ("Informe a quantidade", não "Campo inválido"). Estado vazio explica o próximo passo. Não use exclamação nem emoji.
