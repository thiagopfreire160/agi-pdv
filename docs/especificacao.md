# agi pdv: especificação funcional v1

> Especificação funcional escrita a partir da observação do Hórus PDV (MIT). Não contém código nem textos do original.

Versão do documento: 1.0 — novembro/2026
Público: desenvolvedor(a) responsável pela implementação (front React + Vite + TypeScript; API Node/Fastify + PostgreSQL).

---

## Sumário

1. Visão geral e princípios
2. Perfis e permissões
3. Entidades e campos
4. Módulos
   - 4.1 Primeiro acesso e login
   - 4.2 Usuários
   - 4.3 Minha empresa
   - 4.4 Produtos e categorias
   - 4.5 Clientes
   - 4.6 Fornecedores
   - 4.7 Estoque
   - 4.8 Frente de caixa (resumo — detalhe na seção 5)
   - 4.9 Histórico de vendas
   - 4.10 Trocas e devoluções
   - 4.11 Dashboard
   - 4.12 Relatórios (resumo — detalhe na seção 7)
   - 4.13 Configurações
5. Frente de caixa em detalhe
6. Regras transversais
7. Relatórios
8. Critérios de aceite por módulo
9. Fora da v1
10. Glossário e decisões registradas

---

## 1. Visão geral e princípios

### 1.1 O que é

O agi pdv é um sistema de ponto de venda para pequenos comércios de varejo (mercearias, lojas de roupa, papelarias, lojas de material, conveniências). Ele cobre o cadastro do que se vende, a operação diária do caixa, o controle de estoque, as trocas e os números que o dono precisa ver no fim do dia e do mês.

A v1 **não emite documento fiscal** (NFC-e/NF-e) e **não se integra a maquininhas ou bancos**. Todas as formas de pagamento são registradas manualmente pelo operador: o cliente paga na maquininha ou no PIX da loja, e o operador apenas informa no sistema como a venda foi paga.

### 1.2 Escopo de instalação

- **Uma empresa por instalação.** Não existe multiempresa nem multiloja. Todos os dados pertencem à única empresa cadastrada no primeiro acesso.
- Vários usuários podem usar o sistema ao mesmo tempo, em computadores diferentes da mesma loja (ex.: dois caixas e um computador no escritório).
- O sistema é acessado por navegador. A API e o banco rodam num servidor (pode ser um computador da própria loja).

### 1.3 Princípios de produto

1. **Fácil de ensinar.** Uma pessoa sem experiência deve conseguir vender depois de 10 minutos de explicação. Toda tela tem um único objetivo principal.
2. **Poucos campos obrigatórios.** Só é obrigatório o que o sistema realmente precisa para funcionar. O restante é opcional e pode ser preenchido depois.
3. **Teclado primeiro no caixa.** O operador consegue fazer uma venda inteira sem usar o mouse.
4. **Nada some.** Registros não são apagados de verdade (exclusão lógica). Toda alteração guarda quem fez e quando.
5. **Dinheiro sempre em centavos inteiros.** Nenhum cálculo monetário usa ponto flutuante.
6. **Linguagem do lojista.** Usar termos do dia a dia: "fundo de troco", "sangria", "suprimento", "fechar o caixa", "troca", "vale-troca". Evitar jargão técnico em telas e mensagens.
7. **Mensagens de erro dizem o que fazer.** Toda mensagem de erro explica o problema e a próxima ação (ex.: "Caixa fechado. Abra o caixa para começar a vender.").

### 1.4 Formatos brasileiros

| Item | Formato de exibição | Formato de armazenamento |
|---|---|---|
| Moeda | `R$ 1.234,56` (separador de milhar ponto, decimal vírgula) | inteiro em centavos (`123456`) |
| Data | `dd/mm/aaaa` | data ISO / timestamp com fuso |
| Data e hora | `dd/mm/aaaa hh:mm` (24h) | timestamp com fuso (UTC no banco) |
| CPF | `000.000.000-00` | 11 dígitos, sem máscara |
| CNPJ | `00.000.000/0000-00` | 14 dígitos, sem máscara |
| CEP | `00000-000` | 8 dígitos |
| Telefone | `(00) 0000-0000` ou `(00) 00000-0000` | 10 ou 11 dígitos |
| Quantidade | até 3 casas decimais para unidades fracionáveis, inteira para as demais | decimal com 3 casas |
| Percentual | `12,5%` | decimal com 2 casas |

- **Fuso horário:** a "data do dia" (para caixa, dashboard e relatórios) é calculada no fuso configurado da loja (padrão `America/Sao_Paulo`).
- **Entrada de valores:** campos de dinheiro aceitam digitação com vírgula decimal; ao digitar apenas números, o campo preenche da direita para a esquerda (digitar `1234` resulta em `R$ 12,34`).
- **CPF/CNPJ:** validação pelos dígitos verificadores oficiais; sequências repetidas (ex.: `111.111.111-11`) são inválidas. O campo único de documento aceita CPF (11 dígitos) ou CNPJ (14 dígitos) e decide pelo tamanho.

---

## 2. Perfis e permissões

### 2.1 Perfis

Existem três perfis fixos. Cada usuário tem exatamente um perfil.

| Perfil | Para quem | Resumo |
|---|---|---|
| **Administrador** | Dono da loja | Faz tudo, inclusive gerir usuários, dados da empresa e configurações. |
| **Gerente** | Encarregado, subgerente | Opera e supervisiona: cadastros, estoque, relatórios, autorizações no caixa. Não mexe em usuários administradores nem em configurações de segurança. |
| **Caixa** | Operador de caixa | Vende, recebe, faz sangria/suprimento do próprio caixa, consulta produtos e clientes. |

> Simplificação: perfis fixos, sem editor de permissões granular. A tabela abaixo é a regra; não há tela para alterá-la. Apenas o **limite de desconto** de cada perfil é configurável.

### 2.2 Matriz de permissões

Legenda: **S** = sim; **N** = não; **A** = só com autorização de gerente/administrador no momento da ação; **P** = apenas os próprios registros.

| Ação | Administrador | Gerente | Caixa |
|---|---|---|---|
| Ver dashboard | S | S | N (vê só o resumo do próprio caixa) |
| Gerir usuários (criar, editar, inativar, redefinir senha) | S | S (somente usuários de perfil Caixa) | N |
| Editar Minha empresa | S | N | N |
| Ver Minha empresa | S | S | N |
| Configurações gerais (recibo, limites, caixa) | S | N | N |
| Configurações de segurança/sessões | S | N | N |
| Preferência de tema (claro/escuro) | S | S | S |
| Alterar a própria senha | S | S | S |
| Produtos e categorias — consultar | S | S | S |
| Produtos e categorias — criar/editar/inativar | S | S | N |
| Ver preço de custo e margem | S | S | N |
| Clientes — consultar e cadastrar rápido no caixa | S | S | S |
| Clientes — editar/inativar | S | S | N |
| Fornecedores — consultar/criar/editar/inativar | S | S | N |
| Estoque — entrada de mercadoria | S | S | N |
| Estoque — ajuste manual | S | S | N |
| Estoque — inventário (criar, contar, finalizar) | S | S | Contar: S (se designado); finalizar: N |
| Estoque — histórico de movimentações | S | S | N |
| Abrir e fechar o próprio caixa | S | S | S |
| Fechar caixa de outro operador (forçado) | S | S | N |
| Vender | S | S | S |
| Desconto até o limite do próprio perfil | S | S | S |
| Desconto acima do limite do próprio perfil | S (limite 100%) | A | A |
| Remover item da venda em andamento | S | S | A (se configurado) |
| Cancelar venda em andamento (antes de finalizar) | S | S | A |
| Cancelar venda finalizada | S | S | N (pode pedir com autorização: A) |
| Sangria e suprimento no próprio caixa | S | S | S |
| Histórico de vendas | S (todas) | S (todas) | P (só do caixa aberto atual) |
| Reimprimir recibo | S | S | P |
| Trocas e devoluções | S | S | A |
| Relatórios e exportação CSV | S | S | N |
| Ver trilha de auditoria | S | N | N |

### 2.3 Autorização no momento (supervisor)

Ações marcadas com **A** abrem uma janela de autorização no próprio terminal:

1. O sistema informa qual ação precisa ser autorizada e o motivo (ex.: "desconto de 15% acima do limite de 5%").
2. Um gerente ou administrador digita **e-mail (ou CPF) e senha** ali mesmo.
3. Se as credenciais forem válidas e o perfil tiver permissão, a ação é executada e registrada com **dois responsáveis**: quem executou (o operador logado) e quem autorizou.
4. A autorização vale só para aquela ação. Não troca o usuário logado.
5. Falhas de autorização contam para o bloqueio por tentativas do usuário autorizador (seção 6.4).
6. Campo de motivo: opcional para desconto; **obrigatório** para cancelamento de venda e remoção de item com autorização (texto livre, mínimo 3 caracteres).

---

## 3. Entidades e campos

Convenções valem para todas as tabelas:

- Toda entidade tem `id` (UUID), `criado_em`, `criado_por`, `atualizado_em`, `atualizado_por`. Entidades com exclusão lógica têm também `ativo` (booleano) ou `excluido_em`/`excluido_por` conforme indicado.
- "Texto(n)" indica tamanho máximo. Textos são gravados sem espaços nas pontas.
- "Dinheiro" = inteiro em centavos, nunca negativo salvo indicação.
- "Qtd" = decimal com 3 casas.
- Unicidade é sempre considerada apenas entre registros não excluídos, salvo indicação.

### 3.1 Empresa (registro único)

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome fantasia | Texto(80) | Sim | Aparece no topo do recibo. |
| Razão social | Texto(120) | Não | |
| CNPJ | Texto(14) | Sim | Válido pelos dígitos verificadores. Somente CNPJ na v1 (ver decisões, seção 10). |
| Inscrição estadual | Texto(20) | Não | Aceita "ISENTO". |
| Telefone | Texto(11) | Não | 10 ou 11 dígitos. |
| WhatsApp | Texto(11) | Não | 11 dígitos. |
| E-mail | Texto(120) | Não | Formato de e-mail válido. |
| Site / rede social | Texto(120) | Não | |
| CEP | Texto(8) | Não | 8 dígitos. |
| Logradouro | Texto(120) | Não | |
| Número | Texto(10) | Não | Aceita "S/N". |
| Complemento | Texto(60) | Não | |
| Bairro | Texto(60) | Não | |
| Cidade | Texto(60) | Não | |
| UF | Texto(2) | Não | Uma das 27 siglas. Obrigatória se cidade preenchida. |
| Logo | Imagem | Não | PNG ou JPG, até 1 MB. Armazenada redimensionada (largura máx. 600 px). Usada no recibo, em escala de cinza na impressão térmica. |
| Mensagem do rodapé do recibo | Texto(200) | Não | Ex.: política de trocas. |
| Fuso horário | Texto | Sim | Padrão `America/Sao_Paulo`. |

### 3.2 Usuário

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome | Texto(80) | Sim | Mínimo 2 caracteres. Aparece no recibo como "operador" (apenas o primeiro nome + inicial do sobrenome). |
| E-mail | Texto(120) | Sim | Único, comparado sem diferenciar maiúsculas. Usado no login. |
| CPF | Texto(11) | Não | Válido se preenchido; único. Pode ser usado no login como alternativa ao e-mail. |
| Telefone | Texto(11) | Não | |
| Perfil | Enum | Sim | `administrador`, `gerente`, `caixa`. |
| Senha | Hash | Sim | Ver regras de senha (6.3). Nunca retornada pela API. |
| Deve trocar senha | Booleano | Sim | Verdadeiro ao criar e ao redefinir senha por outro usuário. |
| Ativo | Booleano | Sim | Inativo não faz login nem autoriza ações. |
| Último acesso | Timestamp | — | Preenchido pelo sistema. |
| Tema preferido | Enum | Sim | `claro`, `escuro`, `sistema` (padrão `sistema`). |

Restrições:
- Sempre deve existir **pelo menos um administrador ativo**. O sistema impede inativar, rebaixar ou excluir o último.
- Usuário não pode inativar a si mesmo nem alterar o próprio perfil.

### 3.3 Categoria de produto

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome | Texto(50) | Sim | Único (sem diferenciar maiúsculas/acentos). |
| Ativa | Booleano | Sim | Inativa não aparece para novos cadastros, mas continua nos produtos que já a usam. |

> Simplificação: categorias em um único nível (sem subcategorias).

### 3.4 Produto

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Código interno | Texto(20) | Sim (automático) | Gerado sequencialmente pelo sistema (ex.: `000123`) se não informado. Único. Editável. |
| Código de barras | Texto(14) | Não | Somente dígitos; 8, 12, 13 ou 14 dígitos (EAN-8, UPC-A, EAN-13, GTIN-14). Valida dígito verificador; se inválido, **alerta mas permite salvar** após confirmação (há códigos internos de balança/fornecedor fora do padrão). Único entre produtos não excluídos. |
| Nome (descrição) | Texto(80) | Sim | Mínimo 2 caracteres. É o que aparece no caixa e no recibo. |
| Categoria | Referência | Não | Se vazia, o produto aparece como "Sem categoria" nos relatórios. |
| Unidade | Enum | Sim | `UN` (unidade), `KG` (quilo), `G` (grama), `L` (litro), `ML` (mililitro), `M` (metro), `CX` (caixa), `PCT` (pacote). Padrão `UN`. |
| Fracionável | Derivado | — | Verdadeiro para `KG`, `L`, `M`. Nos demais, quantidade é inteira. |
| Preço de venda | Dinheiro | Sim | Maior que zero. |
| Preço de custo | Dinheiro | Não | Zero ou maior. Usado para margem e valor de estoque. |
| Margem (%) | Derivado | — | `(venda − custo) / venda × 100`, só exibida se custo > 0. Não é armazenada. |
| Estoque atual | Qtd | — | **Não editável no cadastro** depois de criado; só muda por movimentações (seção 4.7). Pode ser negativo apenas se a configuração permitir vender sem estoque. |
| Estoque inicial | Qtd | Não | Só no cadastro. Se > 0, gera movimentação "estoque inicial". |
| Estoque mínimo | Qtd | Não | Padrão 0. Quando estoque atual ≤ mínimo e mínimo > 0, o produto entra em "estoque baixo". |
| Controla estoque | Booleano | Sim | Padrão sim. Se não (ex.: serviços, sacolas), as vendas não baixam estoque e o produto nunca entra em alerta. |
| Fornecedor principal | Referência | Não | |
| Observações | Texto(500) | Não | Uso interno; não aparece no caixa. |
| Ativo | Booleano | Sim | Inativo não aparece na busca do caixa nem é aceito pelo leitor; continua no histórico. |

> Simplificação: um único preço de venda por produto (sem tabela de preços, sem preço promocional programado, sem variações de tamanho/cor). Variações são cadastradas como produtos separados.

### 3.5 Cliente

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome / razão social | Texto(120) | Sim | Mínimo 2 caracteres. |
| CPF ou CNPJ | Texto(14) | Não | Válido se preenchido; único. Tipo de pessoa (física/jurídica) é derivado do tamanho. |
| Celular / WhatsApp | Texto(11) | Não | |
| Telefone | Texto(11) | Não | |
| E-mail | Texto(120) | Não | Formato válido. |
| Data de nascimento | Data | Não | Não pode ser futura. |
| CEP, logradouro, número, complemento, bairro, cidade, UF | Textos | Não | Mesmas regras da empresa. |
| Observações | Texto(500) | Não | |
| Saldo de crédito na loja | Dinheiro | — | Derivado da soma dos vales-troca ativos do cliente. Somente leitura. |
| Ativo | Booleano | Sim | |

> Simplificação: o cadastro mínimo de cliente é **só o nome**. No caixa existe cadastro rápido com nome + CPF/CNPJ + celular.

### 3.6 Fornecedor

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Nome fantasia | Texto(80) | Sim | |
| Razão social | Texto(120) | Não | |
| CNPJ ou CPF | Texto(14) | Não | Válido se preenchido; único. |
| Contato (pessoa) | Texto(80) | Não | Nome do vendedor/representante. |
| Telefone / celular | Texto(11) | Não | |
| E-mail | Texto(120) | Não | |
| Endereço (CEP … UF) | Textos | Não | Mesmas regras da empresa. |
| Observações | Texto(500) | Não | Ex.: prazo de entrega, dia de visita. |
| Ativo | Booleano | Sim | |

### 3.7 Movimentação de estoque

Registro imutável (nunca editado nem excluído). Toda alteração de estoque gera uma movimentação.

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Produto | Referência | Sim | |
| Tipo | Enum | Sim | `estoque_inicial`, `entrada`, `ajuste_mais`, `ajuste_menos`, `inventario`, `venda`, `cancelamento_venda`, `devolucao`. |
| Quantidade | Qtd | Sim | Sempre positiva; o tipo define se soma ou subtrai. Para `inventario`, o sinal vem da diferença (guardar quantidade com sinal + saldo resultante). |
| Saldo anterior | Qtd | Sim | Estoque antes da movimentação. |
| Saldo posterior | Qtd | Sim | Estoque depois. |
| Custo unitário | Dinheiro | Não | Preenchido em entradas. |
| Motivo | Enum/Texto | Condicional | Obrigatório em ajustes (ver 4.7). |
| Documento de origem | Referência | Condicional | Venda, devolução, entrada ou inventário que originou. |
| Usuário | Referência | Sim | |
| Data/hora | Timestamp | Sim | |

### 3.8 Entrada de mercadoria

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Número | Inteiro | Automático | Sequencial. |
| Fornecedor | Referência | Não | |
| Número da nota/pedido | Texto(30) | Não | Apenas referência. |
| Data de recebimento | Data | Sim | Padrão hoje; não pode ser futura. |
| Itens | Lista | Sim (≥ 1) | Produto, quantidade (> 0), custo unitário (≥ 0, opcional). |
| Atualizar custo do produto | Booleano | Sim | Padrão sim: o preço de custo do produto passa a ser o custo unitário da entrada (último custo). |
| Observações | Texto(500) | Não | |
| Situação | Enum | Sim | `rascunho`, `confirmada`. Só a confirmada mexe no estoque. |

> Simplificação: custo do produto = **último custo** de entrada (não custo médio). Entrada confirmada não se edita; um erro se corrige com ajuste.

### 3.9 Inventário (contagem)

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Número | Inteiro | Automático | |
| Descrição | Texto(80) | Sim | Ex.: "Contagem bebidas novembro". |
| Abrangência | Enum | Sim | `todos`, `categoria` (escolher uma ou mais), `selecionados`. |
| Situação | Enum | Sim | `em_contagem`, `finalizado`, `cancelado`. |
| Itens | Lista | — | Produto, quantidade contada (vazia = não contado). |
| Finalizado por / em | Ref./Timestamp | — | |

### 3.10 Sessão de caixa

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Número | Inteiro | Automático | Sequencial. |
| Operador | Referência | Sim | Usuário que abriu. |
| Terminal | Texto(30) | Não | Nome amigável do computador (guardado no navegador, ex.: "Caixa 1"). |
| Aberto em | Timestamp | Sim | |
| Fundo de troco | Dinheiro | Sim | Pode ser zero. |
| Situação | Enum | Sim | `aberto`, `fechado`. |
| Fechado em / por | Timestamp / Ref. | — | |
| Valor esperado em dinheiro | Dinheiro | — | Calculado no fechamento (5.9). |
| Valor contado em dinheiro | Dinheiro | — | Informado no fechamento. |
| Diferença | Dinheiro (com sinal) | — | contado − esperado. |
| Totais por forma de pagamento | Dinheiro | — | Snapshot no fechamento. |
| Observação do fechamento | Texto(500) | Condicional | Obrigatória quando diferença ≠ 0. |
| Fechamento forçado | Booleano | — | Verdadeiro quando fechado por gerente/admin em nome do operador. |

### 3.11 Movimento de caixa (sangria / suprimento / estorno)

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Sessão de caixa | Referência | Sim | Deve estar aberta. |
| Tipo | Enum | Sim | `suprimento` (entra dinheiro), `sangria` (sai dinheiro), `estorno_dinheiro` (devolução em espécie ao cliente). |
| Valor | Dinheiro | Sim | > 0. |
| Motivo | Texto(120) | Não para suprimento; Sim para sangria | Ex.: "depósito no cofre", "pagamento de entregador". |
| Usuário / Autorizador | Referências | Sim / Não | |
| Data/hora | Timestamp | Sim | |

### 3.12 Venda

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Número | Inteiro | Automático | Sequencial único da instalação, gerado na finalização. |
| Sessão de caixa | Referência | Sim | |
| Operador | Referência | Sim | |
| Cliente | Referência | Não | |
| CPF/CNPJ no recibo | Texto(14) | Não | Pode ser informado sem cadastrar cliente. Validado. |
| Itens | Lista | Sim (≥ 1) | Ver 3.13. |
| Subtotal | Dinheiro | Sim | Soma dos totais brutos dos itens menos descontos de item. |
| Desconto na venda | Dinheiro | Sim | Padrão 0. |
| Total | Dinheiro | Sim | > 0 (ver 5.5). |
| Pagamentos | Lista | Sim (≥ 1) | Ver 3.14. |
| Troco | Dinheiro | Sim | Padrão 0. |
| Situação | Enum | Sim | `finalizada`, `cancelada`. (A venda em andamento existe só no terminal até ser finalizada — ver 5.3.) |
| Finalizada em | Timestamp | Sim | |
| Cancelada em / por / autorizada por / motivo | — | Condicional | Preenchidos no cancelamento. |
| Autorizações | Lista | — | Registro de cada autorização dada durante a venda (desconto, remoção de item). |

### 3.13 Item da venda

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Produto | Referência | Sim | |
| Descrição (cópia) | Texto | Sim | Nome do produto no momento da venda. |
| Código de barras (cópia) | Texto | Não | |
| Unidade (cópia) | Enum | Sim | |
| Quantidade | Qtd | Sim | > 0; inteira se unidade não fracionável. |
| Preço unitário (cópia) | Dinheiro | Sim | Preço de venda no momento. |
| Custo unitário (cópia) | Dinheiro | Sim | Preço de custo no momento (para relatório de margem). |
| Total bruto | Dinheiro | Sim | `arred(quantidade × preço unitário)`. |
| Desconto do item | Dinheiro | Sim | Padrão 0. |
| Rateio do desconto da venda | Dinheiro | Sim | Parte do desconto da venda atribuída ao item (5.6). |
| Total líquido | Dinheiro | Sim | bruto − desconto do item − rateio. |
| Quantidade devolvida | Qtd | Sim | Padrão 0. Acumula devoluções. |

### 3.14 Pagamento da venda

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Forma | Enum | Sim | `dinheiro`, `debito`, `credito`, `pix`, `vale_troca`. |
| Valor | Dinheiro | Sim | > 0. Para dinheiro, é o valor **recebido** (pode exceder o restante, gerando troco). |
| Parcelas | Inteiro | Só crédito | 1 a máximo configurado (padrão 12). Padrão 1. Apenas informativo. |
| Vale-troca usado | Referência | Só vale_troca | |
| Observação | Texto(60) | Não | Ex.: últimos dígitos do cartão, código de autorização da maquininha. |

### 3.15 Devolução / troca

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Número | Inteiro | Automático | |
| Venda de origem | Referência | Sim | Deve estar finalizada (não cancelada). |
| Itens devolvidos | Lista | Sim (≥ 1) | Item da venda + quantidade (≤ vendida − já devolvida). |
| Voltam ao estoque | Booleano por item | Sim | Padrão sim. Não, quando o produto está avariado. |
| Valor da devolução | Dinheiro | Calculado | Soma proporcional dos totais líquidos (5.10 / 4.10). |
| Destino do valor | Enum | Sim | `vale_troca` ou `estorno`. |
| Forma do estorno | Enum | Se estorno | `dinheiro`, `debito`, `credito`, `pix`. |
| Motivo | Enum + texto | Sim | `defeito`, `arrependimento`, `tamanho/modelo`, `outro` (+ texto). |
| Usuário / autorizador | Referências | Sim / Condicional | |
| Sessão de caixa | Referência | Se estorno em dinheiro | Caixa aberto de quem faz a devolução. |

### 3.16 Vale-troca (crédito na loja)

| Campo | Tipo | Obrigatório | Regra |
|---|---|---|---|
| Código | Texto(8) | Automático | Alfanumérico maiúsculo, sem caracteres ambíguos (0/O, 1/I). Único. |
| Cliente | Referência | Não | Se a devolução tiver cliente, o vale fica vinculado a ele. |
| Valor original | Dinheiro | Sim | |
| Saldo | Dinheiro | Sim | Diminui a cada uso. |
| Validade | Data | Sim | Emissão + dias configurados (padrão 90). |
| Situação | Enum | Sim | `ativo`, `usado` (saldo zero), `expirado`, `cancelado`. |
| Devolução de origem | Referência | Sim | |

### 3.17 Sessão de login

| Campo | Tipo | Regra |
|---|---|---|
| Usuário | Referência | |
| Identificador secreto | Hash | O valor no cookie nunca é guardado em texto puro; guardar só o hash. |
| Criada em / expira em / último uso | Timestamps | |
| IP e navegador | Textos | Para a tela de sessões ativas. |
| Encerrada em / motivo | — | `logout`, `expirou`, `revogada`, `senha_alterada`, `usuario_inativado`. |

### 3.18 Registro de auditoria

| Campo | Tipo | Regra |
|---|---|---|
| Data/hora | Timestamp | |
| Usuário | Referência | Quem executou. |
| Autorizador | Referência | Quando houver. |
| Entidade e id | Texto + UUID | |
| Ação | Enum | `criar`, `editar`, `inativar`, `reativar`, `excluir`, `login`, `login_falhou`, `logout`, `autorizar`, `cancelar`, etc. |
| Antes / depois | JSON | Somente campos alterados. Senhas e hashes nunca entram. |
| IP | Texto | |

### 3.19 Configurações (registro único)

| Chave | Tipo | Padrão | Regra |
|---|---|---|---|
| Limite de desconto — Caixa | % | 5 | 0 a 100. |
| Limite de desconto — Gerente | % | 20 | 0 a 100; ≥ limite do Caixa. |
| Limite de desconto — Administrador | % | 100 | Fixo. |
| Exigir autorização para remover item | Booleano | Sim | Aplica-se ao perfil Caixa. |
| Permitir vender sem estoque | Booleano | Não | |
| Máximo de parcelas no crédito | Inteiro | 12 | 1 a 24. |
| Validade do vale-troca (dias) | Inteiro | 90 | 1 a 730. |
| Prazo para trocas/devoluções (dias) | Inteiro | 30 | 0 = sem limite. |
| Valor máximo em dinheiro no caixa (alerta de sangria) | Dinheiro | 0 (desligado) | Ver 5.8. |
| Papel do recibo | Enum | 80 mm | `58mm`, `80mm`, `A4`. |
| Mostrar logo no recibo | Booleano | Sim | |
| Imprimir recibo automaticamente ao finalizar | Booleano | Não | Se não, o sistema oferece imprimir. |
| Vias do recibo | Inteiro | 1 | 1 ou 2. |
| Duração da sessão (horas) | Inteiro | 12 | 1 a 24. |
| Encerrar sessão por inatividade (minutos) | Inteiro | 0 (desligado) | 0 ou 5 a 240. |
| Tentativas de login antes do bloqueio | Inteiro | 5 | 3 a 10. |
| Tempo de bloqueio (minutos) | Inteiro | 10 | 5 a 60. |

---

## 4. Módulos

### 4.1 Primeiro acesso e login

**Objetivo:** colocar o sistema em funcionamento em poucos minutos e autenticar usuários com segurança.

#### Telas
- **Assistente de primeiro acesso** (só aparece enquanto não existir empresa cadastrada): passo 1 — dados mínimos da loja (nome fantasia, CNPJ); passo 2 — administrador (nome, e-mail, senha, confirmação). Ao concluir, faz login automaticamente e leva ao dashboard com um aviso convidando a completar "Minha empresa" e cadastrar os primeiros produtos.
- **Login:** campo de e-mail ou CPF, senha, opção de mostrar senha, ação de entrar.
- **Troca de senha obrigatória:** aparece logo após o login quando o usuário tem "deve trocar senha"; pede nova senha e confirmação. Não permite navegar antes de trocar.
- **Meu perfil:** nome, telefone, tema, e alteração da própria senha (pede a senha atual).

> Simplificação: não há auto-cadastro público nem recuperação de senha por e-mail na v1. Quem esquece a senha pede ao administrador/gerente, que gera uma senha temporária (4.2). Para o caso de o único administrador esquecer a senha, a instalação oferece um comando de linha no servidor que gera senha temporária para um e-mail informado (documentar no guia de instalação).

#### Fluxo — login
1. Usuário informa e-mail (ou CPF) e senha.
2. Sistema verifica bloqueio por tentativas (6.4). Se bloqueado, recusa e informa em quantos minutos poderá tentar.
3. Sistema valida credenciais. A mensagem de erro é sempre genérica (não revela se o e-mail existe).
4. Usuário inativo: mesma mensagem genérica de credenciais inválidas.
5. Sucesso: cria sessão, grava cookie, registra último acesso e auditoria, zera contador de falhas.
6. Se "deve trocar senha", leva à troca obrigatória; senão, leva à tela inicial do perfil: dashboard (admin/gerente) ou frente de caixa (caixa).

#### Fluxo — logout
1. Usuário escolhe sair.
2. Se houver venda em andamento no terminal, o sistema avisa que ela será descartada e pede confirmação.
3. A sessão é encerrada no servidor e o cookie removido. O caixa **continua aberto** (sair do sistema não fecha o caixa).

#### Regras
- Uma pessoa pode ter várias sessões (computadores diferentes).
- Ao trocar a própria senha, todas as outras sessões do usuário são encerradas.
- Ao inativar um usuário, todas as sessões dele são encerradas imediatamente.

#### Erros
- Credenciais inválidas; conta bloqueada temporariamente; sessão expirada (ao fazer qualquer ação, redireciona ao login e, após entrar, volta à tela onde estava); senha nova igual à atual; confirmação diferente.

### 4.2 Usuários

**Objetivo:** permitir ao dono controlar quem acessa e o que cada um pode fazer.

#### Telas
- **Lista de usuários:** nome, e-mail, perfil, situação (ativo/inativo), último acesso. Filtro por perfil e situação; busca por nome/e-mail.
- **Formulário de usuário:** nome, e-mail, CPF, telefone, perfil, senha inicial (apenas na criação; com opção "gerar senha automaticamente").
- **Ações por usuário:** editar, redefinir senha, inativar/reativar, encerrar sessões.

#### Fluxos
- **Criar usuário:** preencher → salvar → sistema exibe uma única vez a senha inicial (se gerada) para o administrador repassar. Usuário criado com "deve trocar senha".
- **Redefinir senha:** confirmar → sistema gera senha temporária de 8 caracteres legíveis, exibe uma vez, marca "deve trocar senha" e encerra as sessões do usuário.
- **Inativar:** confirmar → encerra sessões. Se o usuário tiver caixa aberto, o sistema avisa e oferece fechar o caixa de forma forçada antes (4.8 / 5.9).

#### Regras
- Gerente só cria/edita/inativa usuários de perfil Caixa e só atribui o perfil Caixa.
- Não é possível excluir usuário; apenas inativar (ele aparece em vendas e auditoria).
- Último administrador ativo não pode ser inativado nem rebaixado.

#### Erros
- E-mail ou CPF já em uso; CPF inválido; senha fora da política; tentativa de editar a si mesmo para outro perfil; permissão insuficiente.

### 4.3 Minha empresa

**Objetivo:** guardar os dados da loja que aparecem no recibo e nos relatórios.

#### Telas
- **Formulário único** com os blocos: identificação (nome fantasia, razão social, CNPJ, IE), contato (telefone, WhatsApp, e-mail, site), endereço, recibo (logo, mensagem de rodapé) e fuso horário.
- **Pré-visualização do recibo** ao lado/abaixo do formulário, atualizada conforme os dados mudam, usando uma venda de exemplo.

#### Fluxos
- **Buscar endereço pelo CEP (opcional):** ao informar CEP válido, o sistema pode preencher logradouro, bairro, cidade e UF por um serviço público de CEP. Se o serviço não responder, o usuário preenche manualmente sem bloqueio.
- **Enviar logo:** escolher arquivo → validar tipo/tamanho → mostrar prévia → salvar. Opção de remover logo.

#### Regras
- Só administrador edita. Gerente apenas visualiza.
- Alterar dados da empresa afeta a reimpressão de recibos antigos: o cabeçalho reimpresso usa os dados atuais da empresa, enquanto data, itens, preços e pagamentos são sempre os gravados na venda. Ver decisões (seção 10).

#### Erros
- CNPJ inválido; arquivo de logo inválido ou maior que 1 MB; UF inválida.

### 4.4 Produtos e categorias

**Objetivo:** manter o catálogo do que se vende, com preço e controle de estoque.

#### Telas
- **Lista de produtos:** colunas código, código de barras, nome, categoria, unidade, preço de venda, estoque atual, situação. Indicador visual de estoque baixo e de estoque zerado/negativo. Busca única (nome, código interno ou código de barras, parcial). Filtros: categoria, situação (ativos/inativos/todos), "somente estoque baixo". Ordenação por nome, estoque ou preço. Paginação de 50 itens.
- **Formulário de produto:** blocos "básico" (nome, código de barras, preço de venda, unidade, categoria), "estoque" (controla estoque, estoque inicial, estoque mínimo), "custo" (preço de custo, margem calculada; oculto para perfil Caixa) e "mais" (código interno, fornecedor, observações).
- **Categorias:** lista simples com criar, renomear, inativar; mostra quantos produtos usam cada uma.
- **Consulta rápida de preço** (disponível a todos os perfis): campo que aceita leitor de código de barras e mostra nome, preço e estoque.

> Simplificação: o formulário abre com só os campos do bloco "básico" visíveis; os demais ficam recolhidos. Para cadastrar um produto basta nome e preço de venda.

#### Fluxos
- **Cadastrar produto:** preencher nome e preço → (opcional) ler código de barras no campo → salvar. Botão "salvar e cadastrar outro" mantém categoria e unidade preenchidas.
- **Criar categoria a partir do produto:** no campo categoria, digitar um nome que não existe e escolher "criar categoria".
- **Editar produto:** todos os campos, exceto estoque atual. Ao mudar o preço de venda, registra na auditoria o preço antigo e o novo.
- **Inativar/reativar:** confirmar. Produto inativo some do caixa.
- **Excluir:** permitido apenas se o produto nunca teve movimentação além do estoque inicial; nesse caso a exclusão é lógica. Caso contrário, o sistema orienta a inativar.

#### Regras
- Código de barras e código interno únicos.
- Ao mudar a unidade de fracionável para inteira, o sistema bloqueia se o estoque atual tiver casas decimais (orienta ajustar antes).
- Produto sem "controla estoque" não pode ter estoque mínimo nem entra em inventário.
- Preço de venda abaixo do custo: permitido, mas exibe alerta na tela.

#### Erros
- Nome ou preço ausente; preço zero; código de barras duplicado (informar qual produto já usa); código com dígito verificador inválido (confirmação); quantidade fracionada em unidade inteira.

### 4.5 Clientes

**Objetivo:** identificar clientes nas vendas e nas trocas.

#### Telas
- **Lista:** nome, CPF/CNPJ, celular, cidade, saldo de vale-troca, situação. Busca por nome, documento ou telefone.
- **Formulário:** nome (obrigatório), documento, celular, telefone, e-mail, nascimento, endereço (recolhido), observações.
- **Ficha do cliente:** dados + últimas compras (data, número, total) + vales-troca ativos com saldo e validade.
- **Cadastro rápido no caixa:** nome, CPF/CNPJ e celular.

#### Regras
- Documento único quando informado.
- Não há exclusão física; inativar. Cliente inativo não pode ser escolhido em novas vendas.
- Busca no caixa por CPF encontra o cliente pelo documento sem máscara ou com máscara.

#### Erros
- Documento inválido ou já cadastrado (mostrar nome do cliente existente e oferecer abrir a ficha); data de nascimento futura; e-mail inválido.

### 4.6 Fornecedores

**Objetivo:** registrar de quem a loja compra, para usar nas entradas de mercadoria e no cadastro de produtos.

#### Telas
- **Lista:** nome fantasia, documento, contato, telefone, situação. Busca por nome/documento.
- **Formulário:** nome fantasia (obrigatório), demais campos opcionais (ver 3.6).
- **Ficha:** dados + produtos com esse fornecedor principal + últimas entradas.

#### Regras
- Documento único quando informado. Inativar em vez de excluir. Fornecedor inativo não aparece em novas entradas.

### 4.7 Estoque

**Objetivo:** saber quanto existe de cada produto e por que o número mudou.

#### Telas
- **Posição de estoque:** lista de produtos que controlam estoque com quantidade atual, mínimo, custo, valor em estoque (quantidade × custo) e indicador de baixo/zerado. Totais no rodapé: itens, valor de custo total, valor de venda total.
- **Entradas de mercadoria:** lista (número, data, fornecedor, nº nota, total, situação) e formulário de nova entrada.
- **Ajuste de estoque:** formulário rápido para um produto.
- **Inventários:** lista e tela de contagem.
- **Histórico de movimentações:** filtros por produto, tipo, usuário e período; colunas data/hora, produto, tipo, quantidade (com sinal), saldo anterior, saldo posterior, usuário, origem (com atalho para abrir a venda/entrada/devolução).
- **Estoque baixo:** lista de produtos com estoque ≤ mínimo, com sugestão de quantidade a comprar (`mínimo × 2 − atual`, arredondado para cima em unidades inteiras) e fornecedor principal. Exportável em CSV para enviar ao fornecedor.

#### Fluxo — entrada de mercadoria
1. Escolher fornecedor (opcional), data e nº da nota (opcional).
2. Adicionar itens: buscar produto (nome/código/leitor), informar quantidade e custo unitário (já preenchido com o custo atual do produto).
3. Se o produto não existe, oferecer cadastro rápido (nome, preço de venda, código de barras) sem sair da entrada.
4. Revisar total da entrada.
5. Salvar como rascunho **ou** confirmar.
6. Ao confirmar: para cada item, soma ao estoque, gera movimentação `entrada`, e (se marcado) atualiza o preço de custo do produto. Tudo em uma única transação.

> Simplificação: a entrada não gera contas a pagar nem exige nota fiscal. É só "chegou mercadoria".

#### Fluxo — ajuste manual
1. Escolher produto.
2. Escolher "adicionar" ou "retirar" e a quantidade, **ou** informar diretamente "a quantidade correta é X" (o sistema calcula a diferença).
3. Escolher motivo: `perda/quebra`, `vencido`, `uso interno`, `furto`, `correção de lançamento`, `bonificação recebida`, `outro` (texto obrigatório).
4. Confirmar. Gera movimentação `ajuste_mais` ou `ajuste_menos`.

#### Fluxo — inventário
1. Criar inventário: descrição e abrangência (todos, categorias, selecionados). O sistema lista os produtos que controlam estoque dentro da abrangência.
2. Contar: em qualquer computador, o usuário lê o código de barras (cada leitura soma 1 à contagem do produto) ou digita a quantidade contada. Pode salvar e continuar depois; várias pessoas podem contar o mesmo inventário (a última gravação de cada produto vale; leituras somam).
3. Revisar: o sistema mostra, para cada produto, estoque no sistema **no momento da revisão**, quantidade contada e diferença; destaca não contados.
4. Escolher o tratamento dos não contados: "manter estoque atual" (padrão) ou "considerar zero".
5. Finalizar (gerente/admin): para cada produto com diferença, gera movimentação `inventario` levando o estoque à quantidade contada. Inventário vira `finalizado` e não pode mais ser alterado.
6. Cancelar (antes de finalizar): descarta sem mexer no estoque.

> Simplificação: as vendas **não** são bloqueadas durante a contagem. A diferença é calculada contra o estoque do momento da finalização; a orientação ao usuário é contar com a loja fechada ou fora do horário de movimento.

#### Regras
- Toda mudança de estoque passa por movimentação; não existe edição direta do número.
- Movimentações são imutáveis.
- Só pode haver **um inventário em contagem** por produto ao mesmo tempo (o sistema impede criar um segundo que abranja produtos já em contagem).
- Alerta de estoque baixo: produto ativo, controla estoque, mínimo > 0 e atual ≤ mínimo. O alerta aparece no dashboard, na lista de produtos e (como aviso discreto) no caixa ao vender o item.
- Quantidades respeitam a unidade (inteira ou até 3 casas).

#### Erros
- Retirada que deixaria estoque negativo (bloquear, salvo se "permitir vender sem estoque" estiver ligado — mesmo assim, ajustes nunca podem gerar negativo); entrada sem itens; quantidade zero; inventário já finalizado; produto já em outro inventário aberto.

### 4.8 Frente de caixa (resumo)

**Objetivo:** vender rápido e com o dinheiro conferido. O detalhe completo está na seção 5.

#### Telas
- **Abertura de caixa:** informa fundo de troco e nome do terminal.
- **Tela de venda:** campo de busca/leitura sempre focado, lista de itens da venda, totais, cliente, atalhos visíveis.
- **Pagamento:** formas de pagamento, valores, troco.
- **Recibo:** pré-visualização e impressão.
- **Movimentos do caixa:** sangria e suprimento, com lista dos movimentos da sessão.
- **Fechamento:** resumo, contagem e diferença.
- **Caixas abertos** (gerente/admin): lista de sessões abertas, operador, tempo aberto, total vendido; ação de fechamento forçado.

### 4.9 Histórico de vendas

**Objetivo:** encontrar uma venda, conferir, reimprimir, cancelar ou iniciar uma troca.

#### Telas
- **Lista:** número, data/hora, operador, cliente, formas de pagamento (resumo), total, situação. Filtros: período (padrão: hoje), operador, forma de pagamento, situação, cliente; busca por número da venda. Rodapé com quantidade de vendas e soma dos totais **das vendas finalizadas** no filtro.
- **Detalhe da venda:** cabeçalho, itens (com descontos e quantidades já devolvidas), pagamentos (com parcelas e troco), autorizações registradas, devoluções vinculadas, e ações: reimprimir recibo, cancelar venda, iniciar troca/devolução.

#### Regras
- Perfil Caixa só vê vendas da sessão de caixa aberta atual dele.
- Reimpressão marca o recibo como "2ª via" e registra auditoria.
- **Cancelamento de venda finalizada** (gerente/admin, ou caixa com autorização):
  - Só é permitido enquanto a **sessão de caixa da venda estiver aberta** e a venda não tiver devoluções. Depois disso, o caminho é troca/devolução (4.10).
  - Exige motivo.
  - Efeitos: a venda passa a `cancelada`; o estoque de cada item que controla estoque volta (movimentação `cancelamento_venda`); os pagamentos deixam de contar nos totais da sessão (o dinheiro recebido deixa de ser "esperado" no caixa, já descontado o troco); se a venda usou vale-troca, o saldo usado volta ao vale (e, se ele tiver expirado nesse meio-tempo, a validade é estendida em 30 dias).
  - Vendas canceladas continuam visíveis no histórico com a marca de cancelada; não entram em nenhum total de venda.

> Simplificação: não há "cancelamento parcial" de venda finalizada; para devolver só alguns itens, usar troca/devolução.

### 4.10 Trocas e devoluções

**Objetivo:** receber produtos de volta, devolver ao estoque e compensar o cliente com vale-troca ou estorno.

#### Telas
- **Nova devolução:** localizar a venda (por número, leitura do código impresso no recibo, ou busca por cliente/data); escolher itens e quantidades; ver valor calculado; escolher destino (vale-troca ou estorno) e motivo.
- **Lista de devoluções:** número, data, venda de origem, cliente, valor, destino, usuário.
- **Vales-troca:** lista com código, cliente, valor original, saldo, validade, situação; busca por código ou cliente; ação de reimprimir o comprovante do vale e de cancelar vale (admin, com motivo).

#### Fluxo
1. Localizar a venda de origem. Ela deve estar finalizada e dentro do prazo de trocas configurado (contado da data da venda). Fora do prazo, apenas gerente/admin prossegue (ou caixa com autorização).
2. Selecionar itens e quantidades a devolver (no máximo vendida − já devolvida).
3. Para cada item, marcar se volta ao estoque (padrão sim; desmarcar para avaria).
4. O sistema calcula o valor: para cada item, `arred(total líquido do item × quantidade devolvida / quantidade vendida)`. Na última devolução que zera o saldo do item, usa-se o restante exato (total líquido − já devolvido em valor) para não sobrar nem faltar centavo.
5. Escolher destino:
   - **Vale-troca** (padrão): gera vale com o valor, vinculado ao cliente da venda se houver. Imprime comprovante do vale com o código.
   - **Estorno:** escolher a forma. Se dinheiro, o usuário precisa ter caixa aberto; o valor sai do caixa como movimento `estorno_dinheiro` e o sistema impede se não houver dinheiro suficiente esperado no caixa. Se débito/crédito/PIX, apenas registra que o estorno foi feito fora do sistema (na maquininha ou banco) — não mexe no caixa.
6. Informar motivo e confirmar. Efeitos em uma transação: devolução gravada, quantidade devolvida atualizada nos itens da venda, movimentação `devolucao` para itens que voltam ao estoque e controlam estoque, vale ou movimento de caixa criado.

#### Troca (devolver e levar outro produto)

> Simplificação: troca = devolução com vale-troca + nova venda pagando com esse vale. Não há tela de "troca" com dois carrinhos. Para agilizar, ao concluir uma devolução com vale-troca, o sistema oferece "usar agora no caixa", que abre a frente de caixa com o vale já aplicado como forma de pagamento na próxima venda.

#### Regras
- O estorno pode ser feito em qualquer forma, independentemente de como a venda foi paga; o valor estornado é sempre o valor calculado da devolução. Ver decisões (seção 10).
- Vale-troca pode ser usado parcialmente; saldo restante permanece até a validade.
- Vale expirado não é aceito no caixa; administrador pode reativar estendendo a validade (auditoria).
- Uma venda paga com vale-troca pode ser devolvida; o novo vale gerado é um vale novo.

#### Erros
- Venda cancelada ou inexistente; quantidade maior que a disponível; fora do prazo sem autorização; estorno em dinheiro sem caixa aberto ou com dinheiro insuficiente.

### 4.11 Dashboard

**Objetivo:** mostrar ao dono, em uma tela, como está o dia e o mês.

#### Conteúdo
- **Cartões de hoje:** total vendido (líquido de cancelamentos e devoluções), número de vendas, ticket médio (total vendido ÷ número de vendas), itens vendidos.
- **Cartões do mês:** total vendido no mês até hoje, número de vendas, ticket médio, comparação percentual com o mesmo período do mês anterior (dia 1 até o mesmo dia).
- **Gráfico de vendas por período:** seletor 7 dias / 30 dias / 12 meses; barras com total por dia (ou por mês).
- **Vendas por forma de pagamento (hoje e mês):** valores e percentuais.
- **Mais vendidos:** top 10 do período selecionado, por quantidade e por valor (alternável).
- **Estoque baixo:** até 10 produtos (mais críticos primeiro: menor razão atual/mínimo), com atalho para a lista completa.
- **Caixas abertos agora:** operador, desde quando, total vendido na sessão.

#### Regras
- "Total vendido" = soma dos totais das vendas finalizadas − soma dos valores de devoluções no mesmo período (pela data da devolução).
- Atualização automática a cada 60 segundos enquanto a tela estiver aberta.
- Perfil Caixa não acessa o dashboard; sua tela inicial é a frente de caixa, que mostra o resumo da própria sessão.

### 4.12 Relatórios (resumo)

Ver seção 7.

### 4.13 Configurações

**Objetivo:** ajustar o comportamento sem mexer em código.

#### Telas (abas)
- **Caixa e vendas:** limites de desconto por perfil, exigir autorização para remover item, permitir vender sem estoque, máximo de parcelas, alerta de sangria, prazo de trocas, validade do vale-troca.
- **Recibo:** papel (58 mm, 80 mm, A4), mostrar logo, impressão automática, número de vias, botão "imprimir recibo de teste".
- **Aparência:** tema claro, escuro ou seguir o sistema operacional (preferência por usuário, salva no perfil e aplicada imediatamente).
- **Segurança e sessões:** duração da sessão, encerramento por inatividade, tentativas e tempo de bloqueio; lista de sessões ativas de todos os usuários (usuário, IP, navegador, início, último uso) com ação de encerrar uma sessão ou todas de um usuário.
- **Usuários:** atalho para o módulo 4.2.
- **Auditoria:** consulta da trilha de auditoria com filtros por período, usuário, entidade e ação (somente administrador).

#### Regras
- Alterações valem imediatamente para novas ações (uma venda em andamento usa os limites vigentes no momento da finalização).
- Toda mudança de configuração é auditada com valor antigo e novo.

---

## 5. Frente de caixa em detalhe

### 5.1 Estados da sessão de caixa

```
[sem caixa] --abrir--> [aberto] --fechar--> [fechado]
                         |
                         +-- (virou o dia) --> [aberto, vencido] --fechar--> [fechado]
```

| Estado | Pode vender | Pode sangria/suprimento | Pode fechar |
|---|---|---|---|
| Sem caixa | Não | Não | — |
| Aberto | Sim | Sim | Sim |
| Aberto, vencido (aberto em dia anterior, no fuso da loja) | **Não** | Não | Sim |
| Fechado | Não | Não | — |

Regras:
- Cada usuário pode ter **no máximo uma** sessão de caixa aberta. Vários usuários podem ter caixas abertos ao mesmo tempo (um por operador).
- O caixa pertence ao operador, não ao computador. Se o operador entrar em outro computador, continua no mesmo caixa.
- Caixa vencido: ao entrar na frente de caixa, o operador vê aviso de que precisa fechar o caixa do dia anterior antes de abrir o de hoje.

> Simplificação: a regra de validade é apenas "o caixa é do dia em que foi aberto". Sem limite de horas. Lojas que viram a meia-noite abertas devem fechar e reabrir.

### 5.2 Abertura

1. Operador entra na frente de caixa sem caixa aberto.
2. Sistema pede fundo de troco (pode ser R$ 0,00) e nome do terminal (lembrado no navegador; editável).
3. Confirmar → sessão `aberto` criada; o fundo de troco é o primeiro valor "esperado em dinheiro".
4. Opção de imprimir comprovante de abertura (data/hora, operador, fundo).

### 5.3 Venda em andamento

- A venda em andamento existe no terminal (estado local do navegador, persistido no armazenamento local para sobreviver a um recarregamento acidental da página). Só é enviada ao servidor na finalização.
- Se a página for recarregada com uma venda em andamento, ela é restaurada. Se o caixa tiver sido fechado nesse meio-tempo, a venda restaurada é descartada com aviso.
- Ao finalizar, o servidor **revalida tudo** (preços atuais, produto ativo, estoque, limites de desconto, autorizações, caixa aberto) e recalcula os totais. Se o preço de algum produto mudou desde que o item foi incluído, a finalização é recusada e o terminal atualiza os preços, mostrando quais mudaram, para o operador confirmar.

> Decisão: o preço que vale é o atual no momento da finalização (evita vender com preço desatualizado). Ver seção 10.

### 5.4 Adicionar itens

**Campo de busca/leitura** sempre com foco quando nenhuma janela está aberta.

1. **Leitor de código de barras:** o leitor funciona como teclado e envia os dígitos seguidos de Enter. Ao receber Enter, se o texto for só dígitos e corresponder exatamente a um código de barras ou código interno de produto ativo, o item é adicionado com quantidade 1 (ou a quantidade pré-informada).
2. **Quantidade antes do código:** digitar `3*` (ou `3x`) seguido do código adiciona 3 unidades. Para fracionáveis, aceitar vírgula: `0,350*789...`.
3. **Busca por nome (F2):** abre a busca de produtos; digitar parte do nome, código ou código de barras lista até 20 resultados ativos (nome, preço, estoque); setas para navegar, Enter para escolher. Ao escolher um produto fracionável, o sistema pede a quantidade.
4. **Mesmo produto lido de novo:** soma à quantidade do item existente (se o item não tiver desconto próprio; se tiver, cria nova linha).
5. **Produto não encontrado:** aviso sonoro curto e mensagem com o código lido; o campo é limpo e o foco volta. Gerente/admin vê opção de cadastrar na hora.
6. **Produto inativo:** mesmo tratamento de não encontrado, informando que está inativo.
7. **Estoque insuficiente:** se o produto controla estoque e "permitir vender sem estoque" estiver desligado, o item não é adicionado (ou a quantidade não é aumentada) e o sistema informa o disponível. Considera-se a soma das quantidades do mesmo produto na venda.
8. **Alterar quantidade de um item:** selecionar a linha (setas ↑/↓) e digitar `+`/`-` (soma/subtrai 1) ou informar a nova quantidade.

> Simplificação: não há leitura de etiqueta de balança com preço embutido na v1 (fora da v1). Produtos por peso têm a quantidade digitada.

### 5.5 Cálculo de totais

Todos os valores em centavos inteiros. Função de arredondamento `arred(x)` = arredondar para o inteiro mais próximo, com metade para cima (ex.: 12,5 → 13; 12,4999 → 12). Para cálculos com quantidade decimal, fazer a multiplicação em aritmética decimal exata (ou em milésimos inteiros) e arredondar uma única vez no final.

Para cada item *i*:
- `bruto_i = arred(quantidade_i × preço_unitário_i)`
- `desconto_item_i` (0 ≤ `desconto_item_i` < `bruto_i`)
- `após_item_i = bruto_i − desconto_item_i`

Venda:
- `subtotal = Σ após_item_i`
- `desconto_venda` (0 ≤ `desconto_venda` < `subtotal`)
- `total = subtotal − desconto_venda` (deve ser ≥ 1 centavo)
- `desconto_total = Σ desconto_item_i + desconto_venda`
- `percentual_desconto_total = desconto_total / Σ bruto_i × 100`

Exemplo: 3 × R$ 1,99 = 597; 0,350 kg × R$ 29,90 = arred(1046,5) = 1047; subtotal = 1644.

### 5.6 Descontos

**Desconto no item (seleciona o item, atalho de desconto):** informar em R$ ou em %.
- Em %: `desconto_item = arred(bruto × % / 100)`.
- Em R$: valor direto, limitado a `bruto − 1`.

**Desconto na venda (na tela de pagamento):** em R$ ou %, sobre o subtotal.
- Em %: `desconto_venda = arred(subtotal × % / 100)`.

**Limite por perfil:** a verificação é feita sobre o **percentual de desconto total da venda** (`percentual_desconto_total`, seção 5.5), comparado ao limite do perfil do operador logado.
- Se o desconto pedido levar o total acima do limite, o sistema abre a autorização (2.3). O autorizador precisa ter limite ≥ ao percentual resultante (gerente até o limite dele; administrador até 100%).
- A autorização fica registrada na venda com o percentual autorizado. Se depois o operador aumentar ainda mais o desconto, nova autorização é exigida. Remover itens que aumentem o percentual também dispara a verificação na finalização.

> Simplificação: um único limite por perfil, aplicado ao desconto total da venda (soma de item e venda), em vez de limites separados para item e venda.

**Rateio do desconto da venda nos itens** (necessário para devoluções e relatório por produto):
1. Para cada item, `rateio_i = piso(desconto_venda × após_item_i / subtotal)`.
2. `resto = desconto_venda − Σ rateio_i` (sempre entre 0 e o número de itens − 1).
3. Distribuir 1 centavo do resto para os itens em ordem decrescente de `após_item_i` (empate: ordem de inclusão) até zerar.
4. `líquido_i = após_item_i − rateio_i`. Garantia: `Σ líquido_i = total`.

### 5.7 Pagamento e troco

Atalho **F4** abre a tela de pagamento (só se houver ao menos um item).

1. O sistema mostra total, já pago e **restante**.
2. O operador escolhe a forma (atalhos numéricos: 1 Dinheiro, 2 Débito, 3 Crédito, 4 PIX, 5 Vale-troca) e o valor (pré-preenchido com o restante).
3. Regras por forma:
   - **Dinheiro:** valor recebido pode ser maior que o restante. O excedente vira troco. Atalhos de cédulas (R$ 10, 20, 50, 100, 200) somam ao valor digitado.
   - **Débito, PIX:** valor ≤ restante.
   - **Crédito:** valor ≤ restante; informar parcelas (1 até o máximo configurado; padrão 1). Parcelas são só informativas (sem juros calculados).
   - **Vale-troca:** informar o código (ou ler do comprovante); o sistema mostra o saldo; valor = mínimo(saldo, restante). Vale deve estar ativo e dentro da validade. Mais de um vale pode ser usado na mesma venda.
4. Cada pagamento adicionado aparece numa lista com opção de remover (antes de finalizar).
5. Pagamento dividido: repetir 2–4 até restante = 0.
6. **Regra do troco:** troco só pode vir de dinheiro. Formalmente: `soma_não_dinheiro ≤ total` e `troco = max(0, soma_todas − total)`, sendo que `troco ≤ soma_dinheiro`. Só pode haver troco se houver pagamento em dinheiro.
7. Com restante = 0, o botão de finalizar fica disponível; **F4** de novo (ou Enter) finaliza.
8. **Cliente opcional:** antes de finalizar (na tela de venda ou de pagamento), o operador pode identificar o cliente (busca por nome/CPF/celular, ou cadastro rápido) **ou** apenas informar um CPF/CNPJ para sair no recibo.
9. Na finalização, em uma única transação no servidor:
   - revalida (5.3);
   - gera o número da venda;
   - grava venda, itens (com cópias de descrição, preço, custo, rateio), pagamentos, troco e autorizações;
   - baixa o estoque dos itens que controlam estoque (movimentação `venda`);
   - consome saldo dos vales-troca usados;
   - registra auditoria.
   Se qualquer passo falhar, nada é gravado e o terminal mantém a venda em andamento com a mensagem de erro.
10. Proteção contra duplicidade: cada venda em andamento tem um identificador gerado no terminal; reenviar a mesma finalização (ex.: rede caiu e o operador tentou de novo) retorna a venda já gravada em vez de criar outra.
11. Após finalizar: mostra o troco em destaque, oferece imprimir recibo (ou imprime automaticamente, conforme configuração), limpa a venda e devolve o foco ao campo de leitura.

### 5.8 Sangria e suprimento

- **Suprimento:** entrada de dinheiro no caixa (ex.: reforço de troco). Valor > 0, motivo opcional.
- **Sangria:** retirada de dinheiro (ex.: levar ao cofre). Valor > 0, motivo obrigatório, e valor ≤ dinheiro esperado no caixa no momento.
- Ambos geram comprovante imprimível (data/hora, operador, tipo, valor, motivo, espaço para assinatura).
- **Alerta de sangria:** se configurado um valor máximo em dinheiro, quando o dinheiro esperado ultrapassar esse valor o caixa exibe aviso persistente (não bloqueia vendas).
- Sangria e suprimento só no caixa aberto e não vencido. Perfil Caixa só no próprio caixa.

### 5.9 Fechamento com conferência

**Dinheiro esperado** na sessão:

```
esperado = fundo de troco
         + Σ pagamentos em dinheiro das vendas finalizadas (não canceladas)
         − Σ troco dessas vendas
         + Σ suprimentos
         − Σ sangrias
         − Σ estornos em dinheiro
```

Fluxo:
1. Operador escolhe fechar o caixa (não pode haver venda em andamento no terminal; se houver, pedir para finalizar ou descartar).
2. **Contagem cega:** o sistema pede primeiro o **valor contado em dinheiro**, sem mostrar o esperado. Opcionalmente, ajuda a contar por cédulas e moedas (quantidade de cada valor → soma automática).
3. Depois de informado, o sistema mostra o resumo:
   - fundo de troco, vendas por forma de pagamento (dinheiro, débito, crédito, PIX, vale-troca), troco dado, suprimentos, sangrias, estornos em dinheiro, quantidade de vendas, vendas canceladas (quantidade e valor);
   - esperado em dinheiro, contado, **diferença** (sobra se positiva, falta se negativa).
4. Se diferença ≠ 0: observação obrigatória. O operador pode voltar e recontar uma vez antes de confirmar.
5. Confirmar → sessão `fechada`, valores gravados como snapshot. Imprime relatório de fechamento.

> Simplificação: a conferência obrigatória é **só do dinheiro**. Débito, crédito, PIX e vale aparecem como totais registrados para o operador comparar com o relatório da maquininha/extrato, sem campo de contagem.

- **Fechamento forçado** (gerente/admin): pela tela "caixas abertos", o supervisor fecha a sessão de outro operador, informando ele mesmo o valor contado. Fica marcado como forçado e auditado.
- Depois de fechado, a sessão não pode ser reaberta nem editada.

### 5.10 Cancelamentos no caixa

- **Remover item (F8)** da venda em andamento: remove a linha selecionada (ou a última, se nenhuma estiver selecionada). Para perfil Caixa, se a configuração exigir, pede autorização com motivo. A remoção fica registrada nas autorizações da venda quando ela for finalizada (e na auditoria mesmo que a venda seja descartada).
- **Cancelar venda em andamento:** descarta todos os itens. Para perfil Caixa, exige autorização com motivo. Registrado em auditoria com a lista de itens e o total descartado.
- **Cancelar venda finalizada:** pelo histórico (4.9).

### 5.11 Atalhos de teclado do caixa

| Tecla | Ação |
|---|---|
| F2 | Abrir busca de produto |
| F4 | Ir para pagamento / finalizar quando restante = 0 |
| F8 | Remover item selecionado (ou o último) |
| Esc | Voltar/fechar a janela atual; na tela de venda sem janela aberta, não faz nada (evita perder venda) |
| Enter | Confirmar o campo/janela atual |
| ↑ / ↓ | Selecionar item da venda |
| + / − | Aumentar/diminuir 1 na quantidade do item selecionado |
| F3 | Identificar cliente |
| F6 | Desconto (no item selecionado; na tela de pagamento, desconto na venda) |
| F9 | Sangria/suprimento |
| 1–5 (na tela de pagamento) | Escolher forma de pagamento |

Regras:
- Os atalhos ficam visíveis na tela de venda (legenda) para facilitar o aprendizado.
- Atalhos F são interceptados para não acionar funções do navegador (ex.: F5 recarregar só é bloqueado se houver venda em andamento, com confirmação).
- O leitor de código de barras deve funcionar em qualquer momento em que o campo de leitura tiver foco. Para distinguir leitura de digitação humana não é necessário nenhum tratamento especial: Enter confirma em ambos os casos.

### 5.12 Recibo (comprovante não fiscal)

Conteúdo, nesta ordem:
1. Logo (se configurado), nome fantasia, razão social, CNPJ, endereço, telefone.
2. Aviso claro de que **não é documento fiscal**.
3. Número da venda, data/hora, operador (nome curto), terminal.
4. Cliente (nome) e/ou CPF/CNPJ, se informados.
5. Itens: descrição, quantidade × preço unitário, total do item; desconto do item em linha abaixo, se houver.
6. Subtotal, desconto na venda, desconto total, **total**.
7. Pagamentos: forma, valor, parcelas (crédito); troco.
8. Mensagem de rodapé da empresa.
9. Código de barras (Code 128) com o número da venda, para localizar a venda nas trocas.
10. Indicação "2ª via" quando reimpresso; "CANCELADA" quando a venda estiver cancelada.

Impressão pelo diálogo de impressão do navegador, com layout próprio para cada papel (58 mm, 80 mm, A4). Comprovantes de vale-troca, sangria/suprimento, abertura e fechamento seguem o mesmo cabeçalho.

---

## 6. Regras transversais

### 6.1 Auditoria

- Toda criação, alteração, inativação, reativação e exclusão lógica grava `quem` e `quando` no próprio registro e um registro na trilha de auditoria (3.18) com os campos alterados (antes/depois).
- Também são auditados: login, falha de login, bloqueio, logout, troca e redefinição de senha, abertura/fechamento de caixa, sangria/suprimento, autorizações concedidas e negadas, cancelamentos, reimpressões, alterações de configuração e de preço.
- A trilha de auditoria é somente leitura, inclusive para o administrador, e não tem exclusão.
- A data/hora vem sempre do servidor.

### 6.2 Exclusão lógica

- Nenhum registro de negócio é apagado fisicamente. Cadastros (produto, categoria, cliente, fornecedor, usuário) usam **ativo/inativo**; listas mostram apenas ativos por padrão, com filtro para ver inativos.
- Documentos (venda, devolução, entrada, inventário, movimentações) nunca são excluídos; mudam de situação (cancelada, etc.).
- Exclusão "de verdade" de cadastro (para cadastros criados por engano) é exclusão lógica com `excluido_em`; o registro some de todas as listas e buscas, mas permanece no banco.

### 6.3 Senhas

- Mínimo 8 caracteres, com pelo menos uma letra e um número. Máximo 72 caracteres.
- Armazenadas apenas como hash com algoritmo lento e sal por senha (Argon2id, ou bcrypt com custo ≥ 12).
- Senha nunca aparece em logs, auditoria ou respostas da API.
- Senhas temporárias geradas pelo sistema: 8 caracteres sem caracteres ambíguos; exigem troca no primeiro uso.

### 6.4 Bloqueio por tentativas

- Contagem de falhas por combinação **identificador de login + IP**, em janela de 15 minutos.
- Ao atingir o número configurado (padrão 5), bloqueia novas tentativas para aquela combinação pelo tempo configurado (padrão 10 minutos).
- Login bem-sucedido zera o contador.
- Também há um limite geral de requisições de login por IP (ex.: 30 por minuto) para conter ataques a vários usuários.
- As mesmas regras valem para a janela de autorização de supervisor.
- O contador deve sobreviver a reinício do servidor (guardar no banco).

### 6.5 Sessão

- Após login, o servidor cria um identificador de sessão aleatório (≥ 128 bits) e o envia em cookie com as propriedades: `HttpOnly`, `SameSite=Lax` (ou `Strict`), `Secure` quando servido por HTTPS, `Path=/`.
- O front nunca lê nem armazena o identificador.
- Cada requisição verifica a sessão no banco (existe, não expirou, não foi encerrada, usuário ativo) e atualiza o "último uso".
- Expiração absoluta pela duração configurada; expiração por inatividade se configurada.
- Requisições que alteram dados exigem proteção contra CSRF (cookie SameSite + verificação de origem, ou token anti-CSRF).
- Mudança de perfil de um usuário vale na próxima requisição dele (permissões lidas a cada requisição, não guardadas no cookie).

### 6.6 Permissões no servidor

- Toda regra de permissão da seção 2 é verificada **na API**. O front apenas esconde o que o usuário não pode usar.
- O preço de custo e a margem não são enviados ao front para o perfil Caixa.

### 6.7 Consistência e concorrência

- Operações que alteram estoque e dinheiro (finalizar venda, cancelar venda, devolução, entrada, ajuste, inventário, sangria, fechamento) são feitas em uma única transação do banco, com bloqueio das linhas dos produtos/sessão envolvidos para evitar corrida (ex.: dois caixas vendendo a última unidade).
- Edição de cadastro usa controle de versão otimista: se outro usuário salvou o mesmo registro depois que a tela foi aberta, o salvamento é recusado e o usuário é convidado a recarregar.
- Números sequenciais (venda, entrada, devolução, inventário, caixa) não podem se repetir; lacunas são aceitáveis.

### 6.8 Validações gerais

- Toda validação é feita no servidor; o front repete as principais para dar retorno imediato.
- Erros de validação retornam a lista de campos com problema e uma mensagem por campo, para exibição ao lado do campo.
- Textos de busca ignoram maiúsculas/minúsculas e acentos.

### 6.9 Usabilidade comum

- Listas: paginação, busca no topo, filtros persistidos durante a navegação.
- Confirmação antes de ações irreversíveis (cancelar venda, finalizar inventário, fechar caixa, inativar).
- Aviso ao sair de um formulário com alterações não salvas.
- Tema claro/escuro por usuário (4.13).
- Datas e valores sempre nos formatos da seção 1.4.

---

## 7. Relatórios

### 7.1 Regras gerais

- Acesso: administrador e gerente.
- Todos têm filtro de período (data inicial e final, padrão: mês atual; atalhos "hoje", "ontem", "últimos 7 dias", "mês atual", "mês anterior"). Período máximo: 366 dias.
- Datas consideradas no fuso da loja. Vendas pela data de finalização; devoluções pela data da devolução.
- Vendas canceladas **não** entram nos totais, salvo nos relatórios que as listam explicitamente.
- Cada relatório mostra a tabela na tela com totais no rodapé e permite **exportar CSV** e **imprimir**.

### 7.2 Formato do CSV

- Codificação UTF-8 com BOM (para o Excel abrir acentos corretamente).
- Separador de campos: ponto e vírgula (`;`). Texto entre aspas duplas quando contiver `;`, aspas ou quebra de linha.
- Valores monetários com vírgula decimal e sem símbolo (`1234,56`); quantidades com vírgula decimal.
- Datas `dd/mm/aaaa` e data/hora `dd/mm/aaaa hh:mm`.
- Primeira linha com os nomes das colunas. Linha de totais **não** incluída no CSV (facilita importar em planilha).
- Nome do arquivo: `<relatorio>_<aaaa-mm-dd>_a_<aaaa-mm-dd>.csv`.

### 7.3 Relatórios da v1

| # | Relatório | Filtros extras | Colunas | Totais |
|---|---|---|---|---|
| R1 | Vendas por período | Agrupar por dia / semana / mês; operador | Período, nº de vendas, valor bruto, descontos, devoluções, total líquido, ticket médio | Soma de tudo; ticket médio geral |
| R2 | Vendas por forma de pagamento | Operador | Forma, nº de vendas em que aparece, valor recebido (dinheiro já descontado o troco), % do total; para crédito, quebra por nº de parcelas | Soma |
| R3 | Vendas por operador | — | Operador, nº de vendas, total líquido, ticket médio, descontos concedidos, itens removidos com autorização, vendas canceladas (qtd e valor) | Soma |
| R4 | Lista de vendas | Operador, forma, situação, cliente | Nº, data/hora, operador, cliente, formas, desconto, total, situação | Soma das finalizadas |
| R5 | Produtos vendidos | Categoria, operador | Código, produto, categoria, quantidade vendida, quantidade devolvida, faturamento líquido, custo, lucro bruto, margem % | Soma; margem geral |
| R6 | Curva ABC de produtos | Categoria | Posição, produto, faturamento, % do total, % acumulado, classe (A até 80%, B até 95%, C restante) | — |
| R7 | Posição de estoque | Categoria, somente baixo, somente com saldo | Código, produto, unidade, estoque, mínimo, custo, valor de custo, preço de venda, valor de venda | Valor de custo e de venda totais |
| R8 | Movimentações de estoque | Produto, tipo, usuário | Data/hora, produto, tipo, quantidade, saldo anterior, saldo posterior, usuário, origem | Soma de entradas e saídas por tipo |
| R9 | Estoque baixo / sugestão de compra | Fornecedor, categoria | Produto, fornecedor, estoque, mínimo, sugestão de compra, último custo, valor estimado | Valor estimado |
| R10 | Fechamentos de caixa | Operador | Nº sessão, operador, abertura, fechamento, fundo, vendas por forma, suprimentos, sangrias, estornos, esperado, contado, diferença, forçado | Soma das diferenças (sobras e faltas separadas) |
| R11 | Movimentos de caixa | Operador, tipo | Data/hora, sessão, operador, tipo (sangria/suprimento/estorno), valor, motivo, autorizador | Soma por tipo |
| R12 | Devoluções e vales-troca | Destino, motivo | Nº, data, venda de origem, cliente, valor, destino, forma do estorno, motivo, usuário | Soma por destino; saldo total de vales ativos |
| R13 | Descontos e cancelamentos | Operador | Data/hora, venda, operador, tipo (desconto acima do limite, remoção de item, cancelamento de venda), valor, autorizador, motivo | Soma por tipo |

Fórmulas:
- Faturamento líquido do produto = Σ `líquido_i` das vendas finalizadas − valor devolvido daquele produto.
- Custo do produto vendido = Σ (quantidade vendida − quantidade devolvida) × custo unitário copiado na venda, arredondado por item.
- Lucro bruto = faturamento líquido − custo. Margem % = lucro ÷ faturamento × 100 (vazio se faturamento = 0).
- Itens sem preço de custo (custo 0) aparecem com margem vazia e um indicador "sem custo".

> Simplificação: sem construtor de relatórios, sem gráficos nos relatórios (os gráficos ficam no dashboard), sem exportação em PDF/Excel nativo — CSV e impressão bastam.

---

## 8. Critérios de aceite por módulo

Cada item deve ser verificável por teste automatizado ou manual.

### 8.1 Primeiro acesso e login
- [ ] Com banco vazio, qualquer rota leva ao assistente de primeiro acesso; após concluí-lo, o assistente não pode ser acessado novamente.
- [ ] O assistente recusa CNPJ com dígito verificador inválido.
- [ ] Login com e-mail em maiúsculas funciona para e-mail cadastrado em minúsculas.
- [ ] Login com CPF (com ou sem máscara) funciona quando o usuário tem CPF.
- [ ] Credencial errada e usuário inexistente produzem a mesma mensagem e o mesmo código de resposta.
- [ ] Após 5 falhas em 15 min do mesmo e-mail+IP, a 6ª tentativa (mesmo com senha correta) é recusada por 10 min.
- [ ] O cookie de sessão é HttpOnly e não aparece acessível ao JavaScript da página.
- [ ] Usuário com "deve trocar senha" não acessa nenhuma outra tela até trocar.
- [ ] Trocar a senha encerra as demais sessões do usuário.
- [ ] Sessão expirada redireciona ao login e retorna à tela anterior após entrar.
- [ ] O banco não contém senhas em texto puro (verificar coluna de hash).

### 8.2 Usuários e permissões
- [ ] Não é possível inativar ou rebaixar o último administrador ativo.
- [ ] Gerente não consegue criar usuário gerente/administrador nem editar um administrador (verificado chamando a API diretamente).
- [ ] Perfil Caixa recebe erro de permissão ao chamar diretamente a API de criar produto, relatórios e configurações.
- [ ] Perfil Caixa não recebe preço de custo em nenhuma resposta da API.
- [ ] Inativar um usuário derruba as sessões dele imediatamente.
- [ ] Redefinir senha mostra a senha temporária uma única vez.

### 8.3 Minha empresa
- [ ] Salvar com CNPJ inválido é recusado; com CNPJ válido com ou sem máscara é aceito e armazenado sem máscara.
- [ ] Logo acima de 1 MB ou em formato diferente de PNG/JPG é recusado.
- [ ] Nome, endereço, logo e mensagem de rodapé aparecem no recibo de teste.
- [ ] Gerente vê os dados mas não consegue salvar.

### 8.4 Produtos e categorias
- [ ] É possível cadastrar produto informando só nome e preço; o código interno é gerado.
- [ ] Código de barras duplicado é recusado, informando o produto que já o usa.
- [ ] EAN-13 com dígito verificador errado pede confirmação; confirmado, salva.
- [ ] Estoque inicial gera uma movimentação "estoque inicial".
- [ ] O campo estoque atual não é editável após a criação.
- [ ] Produto inativo não é encontrado pela busca nem pelo leitor no caixa.
- [ ] Unidade UN rejeita quantidade 1,5; unidade KG aceita 1,535 e rejeita 1,5355.
- [ ] Margem exibida = (venda − custo)/venda, com 1 casa decimal.

### 8.5 Clientes e fornecedores
- [ ] Cliente pode ser salvo só com nome.
- [ ] CPF `111.111.111-11` é recusado; CPF válido duplicado é recusado com indicação do cliente existente.
- [ ] Campo documento aceita CNPJ válido e define pessoa jurídica.
- [ ] Cliente inativo não aparece na busca do caixa.
- [ ] Fornecedor inativo não aparece na escolha de fornecedor da entrada.

### 8.6 Estoque
- [ ] Entrada confirmada soma as quantidades, gera uma movimentação por item e, com a opção marcada, atualiza o preço de custo.
- [ ] Entrada em rascunho não altera estoque.
- [ ] Ajuste "a quantidade correta é X" gera movimentação com a diferença correta e saldo posterior = X.
- [ ] Ajuste com motivo "outro" sem texto é recusado.
- [ ] Ajuste que deixaria estoque negativo é recusado.
- [ ] Inventário: leitura do mesmo código 3 vezes registra contagem 3.
- [ ] Inventário finalizado leva cada produto contado exatamente à quantidade contada; não contados seguem a opção escolhida.
- [ ] Não é possível criar dois inventários abertos com o mesmo produto.
- [ ] Cada movimentação mostra saldo anterior e posterior coerentes (posterior de uma = anterior da seguinte, por produto).
- [ ] Produto com mínimo 10 e estoque 10 aparece em estoque baixo; com estoque 11, não.

### 8.7 Frente de caixa
- [ ] Sem caixa aberto, não é possível adicionar item.
- [ ] Caixa aberto ontem impede vender hoje e exige fechamento.
- [ ] Um usuário não consegue abrir um segundo caixa enquanto tiver um aberto.
- [ ] Leitura de código (dígitos + Enter) adiciona o produto com quantidade 1; `3*código` adiciona 3.
- [ ] Ler o mesmo código duas vezes resulta em uma linha com quantidade 2.
- [ ] Código inexistente mostra aviso e devolve o foco ao campo de leitura.
- [ ] F2 abre a busca, F4 abre o pagamento, F8 remove o item selecionado, Esc fecha a janela atual.
- [ ] 0,350 kg × R$ 29,90 resulta em R$ 10,47.
- [ ] Desconto de 10% num subtotal de R$ 33,33 resulta em desconto de R$ 3,33 e total de R$ 30,00.
- [ ] Rateio: desconto de R$ 1,00 em 3 itens de R$ 10,00 resulta em 0,34 / 0,33 / 0,33, e a soma dos líquidos = total.
- [ ] Caixa com limite 5% que aplica 6% recebe pedido de autorização; com credencial de gerente válida, a venda finaliza com a autorização registrada (operador e autorizador).
- [ ] Gerente com limite 20% não consegue autorizar 25%; administrador consegue.
- [ ] Pagamento: total R$ 50,00, R$ 20,00 no débito + R$ 50,00 em dinheiro → troco R$ 20,00.
- [ ] Débito maior que o restante é recusado.
- [ ] Troco sem pagamento em dinheiro é impossível.
- [ ] Crédito aceita parcelas de 1 ao máximo configurado e recusa acima.
- [ ] Vale-troca com saldo R$ 30,00 em venda de R$ 50,00 abate R$ 30,00 e deixa saldo 0; em venda de R$ 10,00, deixa saldo R$ 20,00.
- [ ] Vale expirado é recusado.
- [ ] Finalização baixa o estoque e gera movimentações "venda".
- [ ] Dois terminais vendendo a última unidade simultaneamente: apenas uma venda é aceita (com "vender sem estoque" desligado).
- [ ] Reenviar a mesma finalização (mesmo identificador) não cria venda duplicada.
- [ ] Alteração de preço entre a inclusão do item e a finalização faz o terminal avisar e atualizar o preço.
- [ ] Recarregar a página com venda em andamento restaura os itens.
- [ ] Remoção de item por perfil Caixa exige autorização com motivo (configuração ligada) e fica auditada.
- [ ] Sangria maior que o dinheiro esperado é recusada; sangria sem motivo é recusada.
- [ ] Fechamento: fundo 100,00 + vendas em dinheiro 250,00 − troco 30,00 + suprimento 50,00 − sangria 200,00 = esperado 170,00; contado 165,00 → falta de 5,00 e observação obrigatória.
- [ ] O valor esperado não aparece antes de o operador informar o contado.
- [ ] Gerente consegue fechar de forma forçada o caixa de outro operador; o fechamento fica marcado.
- [ ] Recibo impresso contém aviso de não fiscal, itens, descontos, pagamentos, troco e código de barras do número da venda; layout correto em 58 mm, 80 mm e A4.

### 8.8 Histórico de vendas
- [ ] Filtro padrão mostra as vendas de hoje; rodapé soma apenas finalizadas.
- [ ] Perfil Caixa vê apenas vendas da própria sessão aberta.
- [ ] Reimpressão traz a marca de 2ª via e gera auditoria.
- [ ] Cancelar venda com caixa da venda aberto devolve o estoque, exige motivo e reduz o esperado em dinheiro da sessão.
- [ ] Cancelar venda cuja sessão já foi fechada é recusado com orientação para usar devolução.
- [ ] Cancelar venda paga com vale devolve o saldo ao vale.

### 8.9 Trocas e devoluções
- [ ] Não é possível devolver quantidade maior que vendida − já devolvida.
- [ ] Devolução parcial calcula o valor proporcional ao líquido do item; devoluções sucessivas do mesmo item somam exatamente o líquido total.
- [ ] Item marcado "não volta ao estoque" não gera movimentação; os demais geram "devolução".
- [ ] Vale-troca gerado tem código único, validade = hoje + dias configurados e fica vinculado ao cliente da venda.
- [ ] Estorno em dinheiro sem caixa aberto é recusado; com caixa aberto, reduz o esperado em dinheiro.
- [ ] Estorno em cartão/PIX não altera o caixa.
- [ ] Venda fora do prazo de trocas exige gerente/admin ou autorização.
- [ ] "Usar agora no caixa" abre a venda com o vale aplicado.

### 8.10 Dashboard
- [ ] Total de hoje = soma das vendas finalizadas hoje − devoluções de hoje; vendas canceladas não contam.
- [ ] Ticket médio = total ÷ nº de vendas (sem divisão por zero: mostra R$ 0,00).
- [ ] Mais vendidos alterna entre quantidade e valor.
- [ ] Estoque baixo lista no máximo 10 itens, mais críticos primeiro.
- [ ] Perfil Caixa não acessa o dashboard (nem pela API).

### 8.11 Relatórios
- [ ] Cada relatório da tabela 7.3 exporta CSV que abre corretamente no Excel em português (acentos, colunas separadas, vírgula decimal).
- [ ] Totais na tela batem com a soma das linhas do CSV.
- [ ] R2: soma das formas = soma dos totais das vendas do período (dinheiro líquido de troco).
- [ ] R10: diferença por sessão = contado − esperado.
- [ ] Período acima de 366 dias é recusado.

### 8.12 Configurações e transversais
- [ ] Alterar limite de desconto do Caixa vale na próxima finalização.
- [ ] Limite do gerente menor que o do Caixa é recusado.
- [ ] Tema escolhido persiste após sair e entrar em outro computador.
- [ ] Administrador vê e encerra sessões ativas; o usuário afetado é desconectado na próxima ação.
- [ ] Toda edição de produto, cliente, fornecedor, usuário e configuração gera registro de auditoria com antes/depois.
- [ ] Nenhuma tela oferece exclusão física; registros inativados aparecem com o filtro "inativos".
- [ ] Edição concorrente do mesmo produto: o segundo a salvar recebe aviso de conflito.

---

## 9. Fora da v1

- Emissão fiscal (NFC-e, NF-e, SAT, cupom fiscal) e cadastro tributário de produtos (NCM, CFOP, CST).
- Integração com maquininhas/TEF e conciliação de cartões.
- PIX com QR Code dinâmico, boletos e gateways de pagamento.
- Recuperação de senha por e-mail e envio de e-mails (SMTP).
- Cadastro público/autoatendimento e licenciamento.
- Multiempresa e multiloja (transferência entre lojas).
- Compras com pedido ao fornecedor, contas a pagar e a receber, fluxo de caixa financeiro.
- Venda a prazo / fiado (crediário).
- CRM, programa de fidelidade e campanhas.
- Omnichannel / loja virtual / integração com marketplaces.
- Etiquetas de balança com preço/peso embutido e integração com balança.
- Impressão de etiquetas de gôndola e de código de barras.
- Variações de produto (grade de tamanho/cor), kits e composição.
- Tabelas de preço, promoções programadas e preço por quantidade.
- Lote e validade de produtos.
- Modo offline do caixa (vender sem conexão com o servidor).
- Tour guiado/onboarding interativo.
- Permissões personalizáveis por usuário.
- Aplicativo móvel.

---

## 10. Glossário e decisões registradas

### 10.1 Glossário

| Termo | Significado |
|---|---|
| Fundo de troco | Dinheiro colocado na gaveta na abertura do caixa. |
| Sangria | Retirada de dinheiro da gaveta durante o dia. |
| Suprimento | Colocação de dinheiro na gaveta durante o dia. |
| Sessão de caixa | Período entre abertura e fechamento do caixa de um operador. |
| Esperado | Quanto deveria haver em dinheiro na gaveta segundo o sistema. |
| Contado | Quanto o operador contou fisicamente. |
| Vale-troca | Crédito na loja gerado por devolução, com código, saldo e validade. |
| Estorno | Devolução do valor ao cliente pela forma escolhida. |
| Autorização | Confirmação de um gerente/administrador, com senha, para uma ação restrita. |
| Venda em andamento | Itens no terminal ainda não finalizados; não existe no servidor. |

### 10.2 Decisões tomadas nesta especificação

1. **Caixa por operador**, não por empresa nem por computador; vários caixas simultâneos permitidos.
2. **Validade do caixa = dia da abertura** (no fuso da loja), sem limite de horas.
3. **Preço vigente na finalização** prevalece; mudança de preço durante a venda obriga o operador a confirmar.
4. **Limite de desconto único por perfil**, aplicado ao percentual de desconto total da venda (item + venda).
5. **Rateio do desconto da venda** pelo método de maiores valores (centavos restantes vão para os itens maiores), garantindo soma exata.
6. **Cancelamento de venda finalizada** só enquanto o caixa da venda estiver aberto; depois, só por devolução.
7. **Troca = devolução com vale-troca + nova venda** usando o vale; não há fluxo de troca separado.
8. **Estorno** em qualquer forma; em dinheiro sai do caixa aberto de quem faz a devolução; nas demais, é só registro.
9. **Custo do produto = último custo de entrada**, não custo médio.
10. **Conferência de fechamento obrigatória só para dinheiro**, com contagem cega.
11. **Sem recuperação de senha por e-mail**; redefinição pelo administrador/gerente e comando de servidor para o último administrador.
12. **Empresa exige CNPJ** (não aceita CPF de autônomo na v1).
13. **Reimpressão de recibo usa os dados atuais da empresa**, mas itens, preços e pagamentos são sempre os gravados na venda.
14. **Vender sem estoque** é configurável e vem desligado; ajustes manuais nunca deixam estoque negativo.
15. **Venda em andamento fica só no terminal** (persistida no navegador) até a finalização, com identificador para evitar duplicidade.
16. **Inventário não bloqueia vendas**; a diferença é calculada no momento da finalização.
17. **Prazo de troca** padrão de 30 dias; **validade do vale** padrão de 90 dias.
