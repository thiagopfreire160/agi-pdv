# Design system do agi pdv

Fonte única dos tokens: `brand/tokens.css` (cópia em `apps/web/src/estilos/tokens.css`). Nunca escreva cor em hexadecimal num componente. Use as classes semânticas (`bg-superficie`, `text-texto-2`, `bg-primaria`...). É isso que faz os dois temas funcionarem sem retrabalho.

A identidade é preta e dourada, sóbria. O dourado é usado como luz: aparece pouco, em destaques, no item ativo, no botão principal do tema escuro e em linhas finas. Nunca como fundo espalhado.

## Marca

- **Símbolo:** `brand/agi-simbolo.png` (dourado, fundo transparente). Serve nos dois temas. `brand/agi-simbolo-preto.png` é para fundo dourado.
- **Ícones** (símbolo dourado num quadrado preto arredondado): `brand/agi-icone-32.png`, `-64`, `-192`, `-512`. O instalador usa `desktop/build/icon.ico` e `icon.png`.
- **Nome:** sempre **agi pdv**, minúsculo. Na marca, "agi" em Inter Tight 800 na cor `texto` e "pdv" em Inter Tight 300 na cor `destaque`. Componente: `componentes/ui/Logo.tsx`.
- Espaço livre em volta do logo: pelo menos a altura do "a".
- Nada do material da agência com ".hub" entra no produto.

## Temas

O padrão é o **escuro**. O claro existe para balcão muito iluminado. A escolha fica salva em `agipdv-tema`.

| Papel | Claro | Escuro | Onde usar |
|---|---|---|---|
| `fundo` | creme `#F2ECE1` | preto `#0B0B0C` | atrás de tudo |
| `superficie` | `#FAF7F1` | grafite `#1A1A1C` | cards, sidebar |
| `superficie-2` | `#ECE5D8` | `#222225` | campos, linhas alternadas, hover |
| `selecao` | `#EBE0C8` | `#2A261B` | item selecionado, fundo de ícone |
| `veu` | preto 45% | preto 60% | atrás de modal e gaveta |
| `texto` / `texto-2` / `texto-3` | `#0B0B0C` / `#4A453D` / `#6E685E` | `#F2ECE1` / `#B8B2A6` / `#8A857B` | título / corpo / legenda |
| `borda` | `#E0D8C8` | `#2A2927` | divisões |
| `primaria` | preto `#0B0B0C` | dourado `#D4AF37` | botão principal, item ativo |
| `sobre-primaria` | creme | preto | texto em cima da primária |
| `destaque` | dourado escuro `#7A5C0E` | dourado `#D4AF37` | gráficos, número em destaque, barrinha do menu |

No claro o texto dourado é sempre o **dourado escuro**. O dourado normal sobre creme tem contraste de 1,8:1 e não serve para texto.

Cores fixas de marca, para os cards que são sempre escuros: `preto`, `grafite`, `ouro`, `ouro-claro`, `ouro-escuro`, `creme`, `creme-2`.

**Status** sempre em pílula com fundo suave: `ok` (verde), `aviso` (âmbar), `erro` (vermelho), `info` (cinza quente). Cada um tem par claro e escuro (`bg-ok-bg text-ok-fg`). Vermelho sólido (`bg-erro`) só em ação destrutiva: cancelar venda, excluir.

## Cards de destaque

`.card-destaque` e `.card-escuro` são **sempre escuros**, nos dois temas: grafite com halo dourado no canto e filete dourado de 1px. Dentro deles, use `text-creme`, `text-creme/80`, `text-creme-2` e `text-ouro-claro`. A classe `.ondas` adiciona curvas douradas bem fracas.

Usados em: total do caixa, total do pagamento, valor da devolução, preço na ficha do produto, KPI principal do dashboard, relógio do caixa, card de ajuda da sidebar e painel da tela de acesso.

## Tipografia

Todas servidas localmente por `@fontsource` (a loja pode estar sem internet).

| Uso | Fonte |
|---|---|
| Texto e interface | Geist (`font-sans`), 14px, 400 a 600 |
| Título da página | Inter Tight (`font-titulo`) 800, 28px, `tracking-[-0.035em]` |
| Título de card | Inter Tight 600, 15px |
| Teclas de atalho, rótulos técnicos | JetBrains Mono (`font-mono`), maiúsculo quando for rótulo |
| Palavra de destaque | Instrument Serif itálico (`font-serifa`), só na tela de acesso e no site |
| Total do caixa | 48px / 800, `tabular` |

Todo valor em dinheiro, quantidade ou hora usa a classe `tabular`. Serifada itálica nunca em número nem dentro do caixa.

## Forma

- Cards: raio de 18px (`--radius-card`), `bg-superficie`, `shadow-[var(--shadow-card)]`. No claro a sombra é suave; no escuro vira um filete de 1px.
- Botões em pílula (`rounded-full`), altura de 44px (48px no caixa).
- Campos com raio de 12px e altura de 44px.
- Espaçamento em múltiplos de 4px. O vão entre cards é de 16px (20px em telas grandes).

## Layout

- **Sidebar** fixa à esquerda, com 248px, em `bg-superficie`, separada do fundo por 12px de margem e com cantos arredondados. Itens agrupados em *Menu* e *Geral*. O item ativo ganha `bg-selecao`, texto `primaria` e uma barrinha dourada (`bg-destaque`) de 3px à esquerda. No pé fica o card de ajuda.
- **Barra superior** dentro de um card: busca à esquerda; à direita, tema, notificações e avatar.
- **Cabeçalho da página**: título e uma frase curta à esquerda; ações à direita.
- **Dashboard**: 4 KPIs na primeira linha, o primeiro em `.card-destaque`. Abaixo, gráfico de área, lembrete e lista lateral. Na última linha, tabela curta, rosca e o relógio do caixa.
- **Frente de caixa**: tela própria, sem sidebar. À esquerda a busca e os itens; à direita o total (48px) e o botão de pagamento. Atalhos em chips no rodapé.
- No celular, a sidebar vira gaveta. O caixa é pensado para tela a partir de 1024px.

## Componentes base

`Botao` (primario, contorno, fantasma, perigo, suave; tamanhos sm, md e lg; estado carregando), `Campo`, `CampoDinheiro`, `CampoDocumento`, `Selecao`, `Card`, `CardKpi`, `Pilula`, `Tabela`, `Gaveta`, `Modal`, `Confirmacao`, `Toast`, `EstadoVazio`, `Esqueleto`, `Atalho` (chip de tecla em JetBrains Mono).

Ícones: `lucide-react`, com 18px e traço 1.75.

## Gráficos

Recharts. A série principal usa `destaque` com área em gradiente (28% → 0%). Por forma de pagamento: dinheiro `destaque`, PIX `texto`, débito `ouro-claro`, crédito `aviso-fg`, vale-troca `texto-3`. Sem grade vertical, com grade horizontal tracejada em `borda`. Tooltip em card.

## Texto da interface

Português do Brasil, frases curtas, sem jargão. O botão diz o que faz ("Finalizar venda", não "Confirmar"). Mensagem de erro diz o que fazer ("Informe a quantidade", não "Campo inválido"). Estado vazio explica o próximo passo. Não use exclamação nem emoji.
