# Tutorial do agi pdv

Este guia tem duas partes. A primeira é para quem vai **instalar** o sistema. A segunda é para quem vai **usar e ensinar**: dono, gerente e operador de caixa.

---

## Parte 1 — Instalar

### Jeito mais fácil: o instalador (Windows)

1. Rode **`agi-pdv-Setup-1.0.0.exe`**.
2. Como o instalador ainda não tem assinatura digital, o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações** e depois em **Executar assim mesmo**.
3. Siga o instalador. Ele cria o atalho **agi pdv** na área de trabalho e no menu Iniciar.
4. Abra o agi pdv. Na primeira vez ele prepara o banco de dados sozinho e mostra o **primeiro acesso**, onde você cadastra a loja e o administrador.

Não precisa de Node, terminal nem Docker. O que o programa já faz sozinho:

- **Dados:** ficam em `%APPDATA%\AgiPDV`.
- **Backup:** sai um por dia, guardado em **Documentos\agi pdv\backups**. Se a pasta Documentos estiver no OneDrive, o backup vai para a nuvem automaticamente.
- **Menus:** em **Arquivo**, você faz backup na hora, restaura um backup e liga a opção de abrir junto com o Windows. Em **Loja → Endereço para os outros caixas**, aparece o endereço que os outros computadores abrem no navegador.

Para gerar um instalador novo depois de mudar o código: `npm run instalador`. O arquivo sai na pasta `instalador`.

### Jeito para quem vai mexer no código

### O que você precisa

- **Node.js 22** ou mais novo (nodejs.org, versão LTS). Só isso.

O banco de dados vem junto com o agi pdv: é um PostgreSQL portátil que fica na pasta `.banco` do projeto. Não precisa instalar Docker nem PostgreSQL.

### Primeira vez

Abra **dois** terminais na pasta do projeto.

No primeiro, ligue o banco e deixe a janela aberta:

```bash
npm install            # baixa as dependências (só na primeira vez)
npm run db:local       # liga o banco portátil
```

No segundo:

```bash
npm run db:migrar      # cria as tabelas
npm run dev            # liga o sistema
```

Abra **http://localhost:5173** no navegador. Como o banco está vazio, o agi pdv abre o **primeiro acesso**: você informa os dados da loja e cria o usuário administrador. Pronto, já pode cadastrar produtos.

Para testar com uma loja de exemplo cheia de dados, rode `npm run db:semente -- --limpar` antes do `npm run dev` e entre com um destes usuários:

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@agipdv.local | Admin@123 |
| Gerente | gerente@agipdv.local | Gerente@123 |
| Caixa | caixa@agipdv.local | Caixa@123 |

O `--limpar` **apaga tudo** que estiver no banco. Não use na loja de verdade.

### Nos dias seguintes

Dê dois cliques em **`ferramentas\iniciar-agipdv.bat`**. Ele abre uma janela para o banco e outra para o sistema. Deixe as duas abertas enquanto a loja funciona.

Se você já usa Docker, pode trocar o `npm run db:local` por `npm run db:up`. Os dois ocupam a mesma porta, então use só um deles.

### Usar na loja (modo loja)

O `npm run dev` serve para testar e fazer mudanças. Na loja, use o modo loja, que é mais leve e usa um endereço só:

```bash
npm run loja        # prepara tudo e liga o sistema (use depois de atualizar o agi pdv)
npm run iniciar     # só liga, nos dias seguintes
```

Abra **http://localhost:3333** no computador servidor. Nos outros computadores da loja, abra `http://IP-DO-SERVIDOR:3333` (o IP aparece com o comando `ipconfig`, na linha "Endereço IPv4"). Não precisa instalar nada neles: basta o navegador.

Crie um atalho de **`ferramentas\iniciar-agipdv.bat`** na área de trabalho ou na pasta Inicializar do Windows para o agi pdv ligar junto com o computador.

### Backup

O backup copia o banco inteiro para um arquivo na pasta `backups`.

- **Automático:** clique duas vezes em **`ferramentas\agendar-backup.bat`** uma única vez. A partir daí, o Windows faz o backup todo dia às 22h e guarda os últimos 30. O computador precisa estar ligado, com o agi pdv aberto, nesse horário.
- **Na hora:** `npm run backup`.
- **Cópia fora do computador:** em `apps/api/.env`, preencha `BACKUP_PASTA_EXTRA` com uma pasta do OneDrive ou do Google Drive. Se o computador queimar, o backup continua na nuvem.
- **Restaurar:** `npm run restaurar -- backups\nome-do-arquivo.agipdv.gz`. O sistema pede para digitar RESTAURAR antes, porque isso troca todos os dados atuais pelos do arquivo.

Faça um teste de restauração uma vez por mês num computador separado. Backup que nunca foi testado pode não servir na hora que precisar.

### Esqueci a senha do administrador

```bash
npm run admin:senha -- admin@sualoja.com
```

O comando mostra uma senha temporária. No próximo login, o sistema pede uma senha nova.

---

## Parte 2 — Usar e ensinar

### Quem faz o quê

| Perfil | Para quem | Pode |
|---|---|---|
| **Administrador** | dono | tudo, inclusive configurações, dados da empresa e auditoria |
| **Gerente** | encarregado | cadastros, estoque, relatórios, autorizar descontos e cancelamentos, cadastrar operadores de caixa |
| **Caixa** | operador | vender, abrir e fechar o próprio caixa, sangria e suprimento |

Quando o operador tenta algo acima do que o perfil dele permite (por exemplo, um desconto maior que 5%), o sistema pede o e-mail e a senha de um gerente naquele momento. Ninguém precisa trocar de usuário.

### 1. Cadastrar produtos (gerente ou admin)

1. Menu **Produtos** → **Novo produto**.
2. Preencha nome, preço de venda e, se tiver, o código de barras. Os outros campos são opcionais.
3. Para produto vendido por peso, escolha a unidade **KG**.
4. Salve. O produto já aparece no caixa.

A quantidade inicial entra pelo **Estoque → Entrada de mercadoria**, e não pelo cadastro. Assim fica registrado de onde veio cada unidade.

### 2. Abrir o caixa

1. Menu **Caixa**.
2. Conte o dinheiro da gaveta e informe o **fundo de troco**.
3. **Abrir caixa**. A tela de venda ocupa a tela inteira.

### 3. Vender

1. Passe o produto no leitor ou digite o código e tecle Enter.
2. Para vender várias unidades, digite `3*` antes do código. Para peso, digite `0,850*` antes do código.
3. Tecle **F4** (ou clique em **Receber pagamento**).
4. Escolha a forma de pagamento com as teclas **1 a 5**: dinheiro, débito, crédito, PIX e vale-troca. Dá para dividir: R$ 20 no débito e o resto em dinheiro, por exemplo.
5. Em dinheiro, o troco aparece sozinho.
6. **Finalizar venda**. O recibo pode ser impresso.

Cartão e PIX são passados na maquininha, como sempre. O agi pdv só registra a forma de pagamento.

### Atalhos do caixa

| Tecla | Faz |
|---|---|
| F2 | buscar produto pelo nome |
| F3 | identificar cliente |
| F4 | receber pagamento |
| F6 | desconto |
| F8 | remover item |
| F9 | sangria ou suprimento |
| Esc | fechar a janela aberta |
| 1 a 5 | forma de pagamento (na tela de pagamento) |

A lista de atalhos fica sempre visível no rodapé da tela do caixa.

### 4. Sangria e suprimento

- **Sangria** é retirar dinheiro da gaveta (para o cofre, por exemplo).
- **Suprimento** é colocar dinheiro na gaveta (mais troco).

Tecle **F9**, escolha o tipo, informe o valor e o motivo.

### 5. Fechar o caixa

1. **Fechar caixa**, no topo da tela.
2. Conte o dinheiro da gaveta e digite o total. Se ajudar, use a contagem por cédulas.
3. O sistema compara com o valor esperado e mostra se **confere**, se há **sobra** ou se há **falta**.

O operador não vê o valor esperado antes de contar. Essa é a contagem cega, e é ela que dá confiança ao fechamento.

### 6. Trocas e devoluções

1. Menu **Trocas** → **Nova devolução**.
2. Informe o número do recibo e marque os itens devolvidos.
3. Escolha **vale-troca** (o cliente usa depois como pagamento) ou **estorno** (devolve o dinheiro).

Os itens voltam ao estoque sozinhos. Para uma troca, gere o vale e use-o como forma de pagamento na venda nova.

### 7. Estoque

- **Entrada de mercadoria:** quando chega mercadoria do fornecedor.
- **Ajuste:** quebra, perda, vencimento ou correção.
- **Inventário:** contagem geral. As vendas continuam normalmente durante a contagem.
- **Estoque baixo:** produtos abaixo do mínimo. Também aparecem no sininho do topo e no dashboard.

### 8. Relatórios

Menu **Relatórios**: escolha o relatório, o período e clique em **Gerar**. O botão **Baixar planilha** gera um arquivo que abre no Excel.

---

## Roteiro para treinar um operador em 30 minutos

Use a loja de exemplo (`npm run db:semente -- --limpar`) e o usuário `caixa@agipdv.local`.

| Minutos | Atividade |
|---|---|
| 0–5 | Abrir o caixa com R$ 100 de fundo de troco |
| 5–15 | Fazer 5 vendas: uma simples, uma com `3*`, uma por peso, uma em dinheiro com troco e uma dividida entre débito e dinheiro |
| 15–20 | Pedir um desconto de 10% e ver o gerente autorizar |
| 20–25 | Fazer uma sangria de R$ 50 |
| 25–30 | Fechar o caixa contando o dinheiro e conferir que bateu |

Depois disso, o operador já sabe tudo o que vai fazer no dia a dia.
