# NEXO PDV — API v1

Referência completa da API REST usada pelo front. Regras de negócio: `docs/especificacao.md` (a seção indicada entre parênteses em cada rota).

---

## 0. Como rodar

```bash
npm install                       # na raiz (npm workspaces)
npm run db:up                     # Postgres 16 via Docker (usuário postgres / senha nexo / banco nexo e nexo_test)
npm run db:migrar                 # aplica as migrações em apps/api/src/db/migracoes
npm run db:semente -- --limpar    # dados de demonstração (apaga tudo antes)
npm run dev                       # API em http://localhost:3333 (+ web, quando existir)
npm test                          # testes (Vitest) no banco nexo_test
npm run build                     # compila a API para apps/api/dist
```

Configuração: `apps/api/.env` (modelo em `apps/api/.env.example`). Variáveis: `DATABASE_URL`, `DATABASE_URL_TESTE`, `PORTA` (3333), `HOST`, `SEGREDO_SESSAO`, `ORIGEM_WEB` (http://localhost:5173; aceita várias separadas por vírgula), `COOKIE_SEGURO` (true sob HTTPS), `NIVEL_LOG`. Todas têm padrão para desenvolvimento.

### Acessos da semente

| Perfil | E-mail | Senha |
|---|---|---|
| Administrador | admin@nexo.local | Admin@123 |
| Gerente | gerente@nexo.local | Gerente@123 |
| Caixa | caixa@nexo.local | Caixa@123 |

A semente cria o "Mercadinho Bom Preço": 44 produtos em 9 categorias (inclui itens por KG e uma sacola sem controle de estoque), 15 clientes, 5 fornecedores, ~60 dias de vendas (todas as formas de pagamento, pagamentos divididos, vales-troca, descontos autorizados, cancelamentos, devoluções, sangrias, suprimentos, fechamentos com sobras/faltas), entradas de mercadoria, 3 produtos com estoque baixo e o caixa da Carla aberto hoje.

### Senha esquecida do administrador (comando no servidor)

```bash
npm run admin:senha -- admin@loja.com.br
```

Gera uma senha temporária (exibida no terminal), marca "deve trocar senha", reativa o usuário se estiver inativo, encerra as sessões dele e limpa o bloqueio por tentativas.

---

## 1. Convenções

### 1.1 Base, sessão e CSRF

- Base: `http://localhost:3333/api`. No front (Vite em :5173), configure o proxy de `/api` para `http://localhost:3333` — assim o cookie é de mesma origem. Se chamar a API direto, use `credentials: 'include'` (CORS liberado para `ORIGEM_WEB`).
- Sessão: cookie `nexo_sessao` (HttpOnly, SameSite=Lax, Path=/; Secure com `COOKIE_SEGURO=true`). O front **não** lê nem guarda o identificador. Basta enviar o cookie.
- **CSRF:** toda requisição `POST`, `PUT` e `DELETE` precisa do cabeçalho **`X-Nexo-Csrf: 1`**. Sem ele: `403 {codigo:"CSRF"}`. Se houver cabeçalho `Origin`, ele precisa ser a própria API ou estar em `ORIGEM_WEB`.
- Corpo em JSON (`Content-Type: application/json`). Corpo vazio é aceito e vale `{}`.
- Permissões e perfis são verificados na API em toda requisição. O perfil do usuário é relido a cada chamada.

### 1.2 Formatos

| Dado | Formato na API |
|---|---|
| Dinheiro | **inteiro em centavos** (`123456` = R$ 1.234,56). Nunca decimal. |
| Quantidade | número com até 3 casas (`0.35`, `2`). Nas requisições também aceita texto com vírgula (`"0,350"`). Unidades `UN, G, ML, CX, PCT` só aceitam inteiros; `KG, L, M` aceitam 3 casas. |
| Percentual | número (`12.5`). |
| Data | `"aaaa-mm-dd"` (data no fuso da loja). |
| Data e hora | texto ISO 8601 em UTC (`"2026-11-15T05:09:03.094Z"`). O front converte para o fuso da loja (`empresa.fuso_horario`, padrão `America/Sao_Paulo`). |
| CPF / CNPJ / CEP / telefone | entrada com ou sem máscara; armazenados e devolvidos **só com dígitos**. |
| Identificadores | UUID (texto). Números sequenciais (venda, caixa, entrada, devolução, inventário) são inteiros. |

"Hoje", "dia" e períodos de relatórios são calculados no fuso da loja.

### 1.3 Erros

Toda resposta de erro tem o formato:

```json
{ "erro": "Mensagem em pt-BR dizendo o que fazer.", "codigo": "OPCIONAL", "campos": { "nome_do_campo": "mensagem do campo" } }
```

- `campos` aparece em erros de validação (422) — use para mostrar a mensagem ao lado do campo. Campos aninhados usam caminho com ponto: `itens.0.quantidade`, `administrador.senha`.
- Alguns erros trazem dados extras (descritos em cada rota).

| HTTP | `codigo` | Quando |
|---|---|---|
| 400 | — | JSON inválido, identificador em formato inválido |
| 401 | `NAO_AUTENTICADO` | sem cookie de sessão → ir ao login |
| 401 | `SESSAO_EXPIRADA` | sessão expirada/encerrada/usuário inativado → ir ao login e depois voltar à tela anterior |
| 401 | `CREDENCIAIS_INVALIDAS` | login ou credencial do autorizador incorretos (mensagem genérica) |
| 403 | `SEM_PERMISSAO` | perfil sem permissão |
| 403 | `TROCA_SENHA_OBRIGATORIA` | usuário precisa trocar a senha antes de qualquer outra tela |
| 403 | `CSRF` | falta `X-Nexo-Csrf: 1` ou origem não permitida |
| 403 | `AUTORIZACAO_NECESSARIA` | ação exige autorização de supervisor (traz `acao`; ver §3) |
| 403 | `AUTORIZACAO_NEGADA` | autorizador sem permissão/limite |
| 403 | `AUTORIZACAO_INVALIDA` | token de autorização inválido, usado, expirado ou de outra ação |
| 404 | — | registro/rota não encontrado |
| 409 | `PRIMEIRO_ACESSO_PENDENTE` | não existe empresa → mostrar o assistente de primeiro acesso |
| 409 | `PRIMEIRO_ACESSO_CONCLUIDO` | assistente já foi concluído |
| 409 | `CONFLITO_VERSAO` | outro usuário salvou o registro antes → recarregar |
| 409 | `CAIXA_FECHADO`, `CAIXA_VENCIDO`, `CAIXA_JA_ABERTO`, `CAIXA_ABERTO`, `CAIXA_DA_VENDA_FECHADO` | estados do caixa |
| 409 | `PRECOS_ALTERADOS`, `ESTOQUE_INSUFICIENTE`, `DINHEIRO_INSUFICIENTE` | finalização/devolução |
| 409 | `PRODUTO_COM_MOVIMENTACAO`, `PRODUTO_EM_OUTRO_INVENTARIO` | estoque/cadastro |
| 409 | — | duplicidade (código de barras, documento, e-mail…) — com `campos` |
| 422 | — / `CODIGO_BARRAS_INVALIDO` / `OBSERVACAO_OBRIGATORIA` | validação |
| 429 | `BLOQUEADO` | muitas falhas de login (traz `minutos_restantes`) |
| 429 | `LIMITE_IP` | mais de 30 tentativas de login por minuto no mesmo IP |

### 1.4 Listas, filtros e versão

- Listas paginadas aceitam `?pagina=1&por_pagina=50` (máx. 200) e respondem `{ "itens": [...], "total": 123, "pagina": 1, "por_pagina": 50 }`.
- Cadastros com situação aceitam `situacao=ativos|inativos|todos` (padrão `ativos`).
- Buscas (`busca`, `q`) ignoram maiúsculas e acentos.
- **Controle de versão otimista:** todo registro editável devolve `versao` (inteiro). Os `PUT` exigem o `versao` que a tela carregou; se mudou → `409 CONFLITO_VERSAO`.
- `PUT` é parcial: só os campos enviados mudam. Para limpar um campo opcional, envie `null` ou `""`.
- Nada é apagado fisicamente. `DELETE` em cadastros é exclusão lógica e só é permitido para registros criados por engano (sem uso).

### 1.5 Perfis

`administrador` (adm), `gerente` (ger), `caixa` (cx). Na coluna "Perfil": **todos** = qualquer usuário logado; **sup** = administrador e gerente; **adm** = só administrador; **público** = sem login.

---

## 2. Rotas

### 2.1 Sistema e primeiro acesso (4.1)

| Método | Caminho | Perfil | Corpo | Resposta |
|---|---|---|---|---|
| GET | `/saude` | público | — | `{status:"ok"\|"erro", banco:"ok"\|"indisponivel", versao, data_hora}` |
| GET | `/primeiro-acesso` | público | — | `{necessario: boolean}` |
| POST | `/primeiro-acesso` | público | ver abaixo | `201 {usuario, tela_inicial:"dashboard"}` + cookie de sessão (login automático) |
| GET | `/cep/:cep` | todos | — | `{cep, logradouro, bairro, cidade, uf}` ou `404` (serviço não respondeu → preencher à mão) |

Enquanto `necessario` for `true`, todas as outras rotas respondem `409 PRIMEIRO_ACESSO_PENDENTE`.

```json
POST /primeiro-acesso
{
  "empresa": { "nome_fantasia": "Mercadinho Bom Preço", "cnpj": "11.222.333/0001-81" },
  "administrador": { "nome": "Ana", "email": "ana@loja.com", "senha": "Senha123", "confirmacao_senha": "Senha123" }
}
```

Erros: CNPJ inválido (`campos["empresa.cnpj"]`), senha fora da política (8–72 caracteres, ao menos uma letra e um número), confirmação diferente, `409 PRIMEIRO_ACESSO_CONCLUIDO`.

### 2.2 Autenticação e perfil (4.1, 6.3–6.5)

| Método | Caminho | Perfil | Corpo | Resposta |
|---|---|---|---|---|
| POST | `/auth/entrar` | público | `{identificador, senha}` — identificador = e-mail (qualquer caixa) ou CPF (com/sem máscara) | `{usuario: Usuario, deve_trocar_senha, tela_inicial}` + cookie |
| POST | `/auth/sair` | todos | — | `{ok:true}`; encerra a sessão e apaga o cookie. **Não** fecha o caixa. |
| GET | `/auth/eu` | todos | — | `{usuario: Usuario, empresa: {nome_fantasia, fuso_horario, tem_logo} \| null, caixa_aberto: {id, numero, aberto_em, vencido} \| null, tela_inicial}` |
| PUT | `/auth/perfil` | todos | `{nome?, telefone?, tema?: "claro"\|"escuro"\|"sistema"}` | `Usuario` |
| POST | `/auth/senha` | todos | `{senha_atual?, nova_senha, confirmacao_senha}` | `{ok:true, outras_sessoes_encerradas: n}` |

- `tela_inicial`: `"trocar_senha"` (se deve trocar), `"dashboard"` (adm/ger) ou `"caixa"` (cx).
- `/auth/eu`, `/auth/sair` e `/auth/senha` funcionam mesmo com troca de senha pendente; qualquer outra rota responde `403 TROCA_SENHA_OBRIGATORIA`.
- `/auth/senha`: `senha_atual` é obrigatória, **exceto** na troca obrigatória (quando `deve_trocar_senha` é true). Erros: senha atual incorreta, nova igual à atual, confirmação diferente, política. Trocar a senha encerra as outras sessões do usuário.
- Login falho: `401 CREDENCIAIS_INVALIDAS` (mesma mensagem para e-mail inexistente, senha errada ou usuário inativo). Após 5 falhas em 15 min para o mesmo identificador+IP (configurável) → `429 BLOQUEADO` com `minutos_restantes`, mesmo com a senha certa.

**Usuario**

```json
{ "id": "uuid", "nome": "Ana Paula Ribeiro", "email": "admin@nexo.local", "cpf": "12345678909", "telefone": "11999990000",
  "perfil": "administrador", "deve_trocar_senha": false, "ativo": true, "ultimo_acesso": "ISO", "tema": "sistema",
  "versao": 1, "criado_em": "ISO" }
```

### 2.3 Usuários e sessões ativas (4.2, 4.13)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/usuarios` | sup | `?busca&perfil&situacao&pagina&por_pagina` | lista de `Usuario` |
| GET | `/usuarios/:id` | sup | — | `Usuario` |
| POST | `/usuarios` | sup | `{nome, email, cpf?, telefone?, perfil, senha?, gerar_senha?}` | `201 {usuario: Usuario, senha_temporaria: string\|null}` |
| PUT | `/usuarios/:id` | sup | `{versao, nome?, email?, cpf?, telefone?, perfil?}` | `Usuario` |
| POST | `/usuarios/:id/redefinir-senha` | sup | — | `{senha_temporaria}` |
| POST | `/usuarios/:id/inativar` | sup | — | `Usuario` |
| POST | `/usuarios/:id/reativar` | sup | — | `Usuario` |
| POST | `/usuarios/:id/encerrar-sessoes` | sup | — | `{sessoes_encerradas: n}` |
| GET | `/sessoes` | adm | — | `{itens: [{id, usuario_id, usuario_nome, perfil, ip, navegador, criada_em, ultimo_uso, expira_em}]}` |
| DELETE | `/sessoes/:id` | adm | — | `{ok:true}` |

- Sem `senha` (ou com `gerar_senha:true`) o sistema gera uma senha temporária de 8 caracteres e devolve **uma única vez** em `senha_temporaria`. Todo usuário criado fica com `deve_trocar_senha: true`.
- **Gerente** só cria/edita/inativa/redefine usuários de perfil `caixa` e só atribui `caixa` → senão `403`.
- Ninguém altera o próprio perfil nem inativa a si mesmo (`422`). O último administrador ativo não pode ser rebaixado nem inativado (`409`).
- Inativar usuário com caixa aberto → `409 {codigo:"CAIXA_ABERTO", sessao_caixa_id}`: ofereça o fechamento forçado (`POST /caixa/sessoes/:id/fechar`) e repita. Inativar encerra as sessões do usuário na hora.
- Redefinir senha encerra as sessões do usuário e limpa o bloqueio por tentativas.
- Erros: e-mail/CPF já usados (`409` com `campos.email`/`campos.cpf`), CPF inválido.

### 2.4 Minha empresa (4.3)

| Método | Caminho | Perfil | Corpo | Resposta |
|---|---|---|---|---|
| GET | `/empresa` | sup | — | `Empresa` |
| PUT | `/empresa` | adm | `{versao, ...campos}` | `Empresa` |
| PUT | `/empresa/logo` | adm | `{imagem: "data:image/png;base64,..." ou base64 puro}` | `Empresa` |
| DELETE | `/empresa/logo` | adm | — | `Empresa` |
| GET | `/empresa/logo` | todos | — | bytes da imagem (`image/png` ou `image/jpeg`) ou `404` |

**Empresa**: `{id, nome_fantasia, razao_social, cnpj, inscricao_estadual, telefone, whatsapp, email, site, cep, logradouro, numero, complemento, bairro, cidade, uf, mensagem_rodape, fuso_horario, versao, atualizado_em, tem_logo}`.

Regras: CNPJ válido (com ou sem máscara; salvo sem máscara); `inscricao_estadual` aceita "ISENTO"; `numero` aceita "S/N"; `uf` sigla válida e obrigatória se `cidade` preenchida; `whatsapp` 11 dígitos; `fuso_horario` IANA válido. Logo: só PNG/JPG até 1 MB (senão `422`); é guardada redimensionada para largura máxima de 600 px.

### 2.5 Configurações (4.13, 3.19)

| Método | Caminho | Perfil | Corpo | Resposta |
|---|---|---|---|---|
| GET | `/configuracoes` | todos | — | `Configuracoes` |
| PUT | `/configuracoes` | adm | `{versao, ...campos alterados}` | `Configuracoes` |
| GET | `/configuracoes/recibo-teste` | todos | — | `Recibo` com venda de exemplo (`exemplo: true`) |

**Configuracoes** (com limites):

```json
{ "limite_desconto_caixa": 5, "limite_desconto_gerente": 20, "limite_desconto_administrador": 100,
  "exigir_autorizacao_remover_item": true, "permitir_vender_sem_estoque": false,
  "max_parcelas_credito": 12, "validade_vale_troca_dias": 90, "prazo_trocas_dias": 30,
  "alerta_sangria_valor": 0, "papel_recibo": "80mm", "mostrar_logo_recibo": true,
  "imprimir_automaticamente": false, "vias_recibo": 1, "duracao_sessao_horas": 12,
  "inatividade_minutos": 0, "tentativas_login": 5, "tempo_bloqueio_minutos": 10,
  "versao": 1, "atualizado_em": "ISO" }
```

Validações: limites 0–100 (2 casas) e gerente ≥ caixa (`campos.limite_desconto_gerente`); parcelas 1–24; vale 1–730 dias; prazo de trocas ≥ 0 (0 = sem limite); `alerta_sangria_valor` centavos (0 = desligado); `papel_recibo` `58mm|80mm|A4`; vias 1–2; sessão 1–24 h; inatividade 0 ou 5–240 min; tentativas 3–10; bloqueio 5–60 min. `limite_desconto_administrador` é fixo (100) e ignorado no PUT. Toda mudança é auditada e vale na próxima ação.

### 2.6 Auditoria (4.13, 6.1)

| Método | Caminho | Perfil | Query | Resposta |
|---|---|---|---|---|
| GET | `/auditoria` | adm | `inicio, fim (aaaa-mm-dd), usuario_id, entidade, entidade_id, acao, pagina, por_pagina` | lista de `{id, data_hora, usuario_id, usuario_nome, autorizador_id, autorizador_nome, entidade, entidade_id, acao, antes, depois, ip}` (mais recentes primeiro) |

`antes`/`depois` trazem só os campos alterados (nunca senhas). Entidades: `usuario, empresa, configuracoes, categoria, produto, cliente, fornecedor, entrada, inventario, sessao_caixa, venda, venda_em_andamento, devolucao, vale_troca, autorizacao, sessao_login, sistema`. Ações frequentes: `criar, editar, inativar, reativar, excluir, login, login_falhou, bloqueio, logout, trocar_senha, redefinir_senha, encerrar_sessoes, abrir, fechar, fechar_forcado, sangria, suprimento, finalizar, cancelar, reimprimir, autorizar, autorizacao_negada, alterar_preco, ajuste_estoque, confirmar, alterar_logo, remover_logo`.

### 2.7 Categorias (4.4)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/categorias` | todos | `?situacao&busca` | `{itens: [{id, nome, ativo, versao, quantidade_produtos}]}` (sem paginação) |
| POST | `/categorias` | sup | `{nome}` | `201 Categoria` |
| PUT | `/categorias/:id` | sup | `{nome, versao}` | `Categoria` |
| POST | `/categorias/:id/inativar` · `/reativar` | sup | — | `Categoria` |
| DELETE | `/categorias/:id` | sup | — | `{ok:true}`; `409` se houver produtos |

Nome único sem diferenciar maiúsculas/acentos (`409`, `campos.nome`).

### 2.8 Produtos (4.4)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/produtos` | todos | `?busca&categoria_id (uuid ou "sem")&situacao&estoque_baixo=true&ordenar=nome\|estoque\|preco\|codigo&direcao=asc\|desc&pagina&por_pagina` | lista de `Produto` |
| GET | `/produtos/busca?q=` | todos | busca do caixa (F2): só ativos, até 20, por nome/código/código de barras (parcial) | `{itens: [Produto]}` |
| GET | `/produtos/codigo/:codigo` | todos | leitor: correspondência **exata** de código de barras ou código interno | `Produto`; `404` com mensagem "não encontrado" ou "está inativo" |
| GET | `/produtos/:id` | todos | — | `Produto` |
| POST | `/produtos` | sup | ver abaixo | `201 Produto` |
| PUT | `/produtos/:id` | sup | `{versao, ...}` | `Produto` |
| POST | `/produtos/:id/inativar` · `/reativar` | sup | — | `Produto` |
| DELETE | `/produtos/:id` | sup | — | `{ok:true}`; `409 PRODUTO_COM_MOVIMENTACAO` se teve qualquer movimentação além do estoque inicial (orientar a inativar) |

**Produto**

```json
{ "id": "uuid", "codigo": "000001", "codigo_barras": "7891000000007", "nome": "Arroz Tipo 1 5kg",
  "categoria_id": "uuid|null", "categoria_nome": "Mercearia|null", "unidade": "UN", "fracionavel": false,
  "preco_venda": 2690, "estoque_atual": 61, "estoque_minimo": 15, "estoque_baixo": false, "controla_estoque": true,
  "fornecedor_id": "uuid|null", "fornecedor_nome": "Atacadão Paulista|null", "observacoes": null, "ativo": true,
  "versao": 1, "criado_em": "ISO", "atualizado_em": "ISO",
  "preco_custo": 2050, "margem": 23.8, "preco_abaixo_do_custo": false }
```

`preco_custo`, `margem` (1 casa; `null` sem custo) e `preco_abaixo_do_custo` **só vêm para adm/ger** — o perfil Caixa nunca recebe custo em nenhuma rota. Sem categoria → "Sem categoria" nos relatórios.

**Criar** (`POST /produtos`): obrigatório só `nome` (2–80) e `preco_venda` (> 0). Opcionais: `codigo` (gerado sequencialmente `000123` se vazio), `codigo_barras` (8/12/13/14 dígitos), `categoria_id`, `unidade` (`UN` padrão; `KG, G, L, ML, M, CX, PCT`), `preco_custo` (≥ 0), `estoque_inicial` (gera movimentação `estoque_inicial`), `estoque_minimo`, `controla_estoque` (padrão true), `fornecedor_id`, `observacoes`, `confirmar_codigo_barras_invalido`.
- Código de barras com dígito verificador inválido → `422 {codigo:"CODIGO_BARRAS_INVALIDO"}`; peça confirmação e reenvie com `confirmar_codigo_barras_invalido: true`.
- Código de barras/código interno duplicado → `409` com `produto_existente: {id, nome, codigo}`.
- Produto sem controle de estoque não pode ter estoque mínimo/inicial.

**Editar**: mesmos campos (exceto `estoque_inicial`) + `versao`. **Estoque atual nunca é editável** (é ignorado). Mudar de unidade fracionável para inteira com estoque fracionado → `422` (orientar ajuste). Mudança de preço é auditada (`alterar_preco`).

### 2.9 Clientes (4.5)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/clientes` | todos | `?busca&situacao&pagina&por_pagina` — busca por nome, documento ou telefone (com/sem máscara) | lista de `Cliente`. Para o perfil Caixa só ativos. |
| GET | `/clientes/:id` | todos | — | `Cliente` + `ultimas_compras: [{id, numero, finalizada_em, total, situacao}]` (10) + `vales_ativos: [{id, codigo, valor_original, saldo, validade, situacao}]` |
| POST | `/clientes` | todos | `Cliente` sem id. **Caixa**: só `nome`, `documento`, `celular` são gravados (cadastro rápido) | `201` ficha do cliente |
| PUT | `/clientes/:id` | sup | `{versao, ...}` | ficha |
| POST | `/clientes/:id/inativar` · `/reativar` | sup | — | ficha |
| DELETE | `/clientes/:id` | sup | — | `{ok:true}`; `409` se tiver compras/vales |

**Cliente**: `{id, nome, documento, tipo_pessoa: "fisica"|"juridica"|null, celular, telefone, email, data_nascimento, cep, logradouro, numero, complemento, bairro, cidade, uf, observacoes, saldo_credito, ativo, versao, criado_em, atualizado_em, ...}`. `saldo_credito` = soma dos vales ativos e válidos (somente leitura). Só `nome` é obrigatório. `documento` aceita CPF ou CNPJ (decide pelo tamanho); duplicado → `409` com `cliente_existente: {id, nome}`. Nascimento não pode ser futuro.

### 2.10 Fornecedores (4.6)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/fornecedores` | sup | `?busca&situacao&pagina&por_pagina` | lista de `Fornecedor` |
| GET | `/fornecedores/:id` | sup | — | `Fornecedor` + `produtos: [{id, codigo, nome, estoque_atual, estoque_minimo, preco_custo, ativo}]` + `ultimas_entradas: [{id, numero, data_recebimento, numero_nota, situacao, total}]` |
| POST | `/fornecedores` | sup | `{nome_fantasia, razao_social?, documento?, contato?, telefone?, email?, cep?…uf?, observacoes?}` | `201` ficha |
| PUT | `/fornecedores/:id` | sup | `{versao, ...}` | ficha |
| POST | `/fornecedores/:id/inativar` · `/reativar` | sup | — | ficha |
| DELETE | `/fornecedores/:id` | sup | — | `{ok:true}`; `409` se tiver produtos/entradas |

Documento duplicado → `409` com `fornecedor_existente`. Para a escolha na entrada use `situacao=ativos` (fornecedor inativo é recusado na entrada).

### 2.11 Estoque (4.7)

| Método | Caminho | Perfil | Query / corpo | Resposta |
|---|---|---|---|---|
| GET | `/estoque/posicao` | sup | `?busca&categoria_id&somente_baixo&somente_com_saldo&incluir_inativos` | `{itens: [{id, codigo, codigo_barras, nome, unidade, categoria_id, categoria_nome, estoque_atual, estoque_minimo, preco_custo, preco_venda, ativo, valor_custo, valor_venda, situacao_estoque: "ok"\|"baixo"\|"zerado"\|"negativo"}], totais: {itens, valor_custo, valor_venda}}` (só produtos que controlam estoque) |
| GET | `/estoque/baixo` | sup | `?fornecedor_id&categoria_id&formato=json\|csv` | `{itens: [{id, codigo, nome, unidade, estoque_atual, estoque_minimo, preco_custo, fornecedor_id, fornecedor_nome, categoria_nome, sugestao_compra, ultimo_custo, valor_estimado}], totais: {valor_estimado}}` — mais críticos primeiro (menor atual/mínimo). `sugestao_compra = ceil(mínimo×2 − atual)`. CSV: arquivo `estoque_baixo_aaaa-mm-dd.csv` |
| GET | `/estoque/movimentacoes` | sup | `?produto_id&tipo&usuario_id&inicio&fim&pagina&por_pagina` | lista de `{id, data_hora, produto_id, produto_nome, produto_codigo, unidade, tipo, quantidade, quantidade_com_sinal, saldo_anterior, saldo_posterior, custo_unitario, motivo, motivo_texto, usuario_id, usuario_nome, origem_tipo, origem_id, origem_numero}` (mais recentes primeiro) |
| POST | `/estoque/ajustes` | sup | `{produto_id, operacao: "adicionar"\|"retirar"\|"definir", quantidade, motivo, motivo_texto?}` | `201 {produto_id, saldo_anterior, saldo_posterior, variacao}` |

- `tipo` de movimentação: `estoque_inicial, entrada, ajuste_mais, ajuste_menos, inventario, venda, cancelamento_venda, devolucao`. `quantidade` é sempre positiva (exceto `inventario`, com sinal); use `quantidade_com_sinal` para exibir.
- `origem_tipo`: `produto` (estoque inicial), `entrada`, `ajuste`, `inventario`, `venda`, `devolucao` — `origem_id`/`origem_numero` permitem abrir o documento.
- Ajuste: `operacao:"definir"` = "a quantidade correta é X" (o sistema calcula a diferença). `motivo`: `perda_quebra, vencido, uso_interno, furto, correcao_lancamento, bonificacao_recebida, outro` (`outro` exige `motivo_texto` ≥ 3). Nunca deixa estoque negativo (`422`). Sem diferença → `422`.

### 2.12 Entradas de mercadoria (3.8, 4.7)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/entradas` | sup | `?situacao=rascunho\|confirmada&fornecedor_id&inicio&fim&busca(nº nota ou nº entrada)&pagina&por_pagina` | lista de `{id, numero, data_recebimento, fornecedor_id, fornecedor_nome, numero_nota, situacao, criado_em, versao, total, quantidade_itens}` |
| GET | `/entradas/:id` | sup | — | `Entrada` |
| POST | `/entradas` | sup | ver abaixo | `201 Entrada` |
| PUT | `/entradas/:id` | sup | mesmo corpo (+ `versao`) — só em rascunho | `Entrada` |
| POST | `/entradas/:id/confirmar` | sup | — | `Entrada` |

```json
POST /entradas
{ "fornecedor_id": "uuid|null", "numero_nota": "12345", "data_recebimento": "2026-11-15", "atualizar_custo": true,
  "observacoes": null, "itens": [ { "produto_id": "uuid", "quantidade": 24, "custo_unitario": 590 } ], "confirmar": false }
```

- `data_recebimento` padrão hoje e não pode ser futura; `custo_unitario` padrão = custo atual do produto; `confirmar: true` grava e confirma de uma vez.
- Confirmar soma ao estoque (uma movimentação `entrada` por item) e, com `atualizar_custo`, o custo do produto passa a ser o custo da entrada (último custo). Rascunho não mexe no estoque. Entrada confirmada não se edita (`409`).
- Produto que não controla estoque não entra; fornecedor inativo é recusado.
- **Entrada**: `{id, numero, fornecedor_id, fornecedor_nome, numero_nota, data_recebimento, atualizar_custo, observacoes, situacao, confirmada_em, confirmada_por, versao, criado_em, criado_por_nome, itens: [{id, ordem, produto_id, produto_nome, produto_codigo, codigo_barras, unidade, quantidade, custo_unitario, total}], total}`.
- Cadastro rápido de produto durante a entrada: use `POST /produtos`.

### 2.13 Inventários (3.9, 4.7)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/inventarios` | todos | `?situacao=em_contagem\|finalizado\|cancelado` — Caixa vê só os em contagem em que foi designado | `{itens: [{id, numero, descricao, abrangencia, situacao, criado_em, finalizado_em, criado_por_nome, usuarios_designados, total_produtos, contados}]}` |
| POST | `/inventarios` | sup | `{descricao, abrangencia: "todos"\|"categoria"\|"selecionados", categoria_ids?, produto_ids?, usuarios_designados?: [uuid]}` | `201 Inventario` |
| GET | `/inventarios/:id` | sup ou designado | — | `Inventario` (tela de revisão) |
| POST | `/inventarios/:id/leituras` | sup ou designado | `{codigo}` (código de barras ou interno) | `{produto_id, nome, quantidade_contada}` — cada leitura soma 1 |
| PUT | `/inventarios/:id/itens/:produtoId` | sup ou designado | `{quantidade_contada: número \| null}` (`null` = não contado) | `{produto_id, quantidade_contada}` |
| POST | `/inventarios/:id/finalizar` | sup | `{nao_contados: "manter"\|"zerar"}` (padrão manter) | `Inventario` |
| POST | `/inventarios/:id/cancelar` | sup | — | `Inventario` |

**Inventario**: `{id, numero, descricao, abrangencia, categoria_ids, usuarios_designados, situacao, nao_contados, finalizado_em, ..., itens: [{produto_id, codigo, codigo_barras, nome, unidade, categoria_nome, quantidade_contada, contado, estoque_atual, estoque_sistema, diferenca, contado_em, contado_por_nome, estoque_no_fechamento}], resumo: {total_produtos, contados, nao_contados, com_diferenca}}`. Em contagem, `estoque_sistema` é o estoque **no momento da consulta**; após finalizar, é o do momento da finalização.

Regras: só produtos ativos que controlam estoque entram; um produto não pode estar em dois inventários em contagem (`409 PRODUTO_EM_OUTRO_INVENTARIO`); finalizar gera movimentação `inventario` só onde há diferença; finalizado/cancelado não aceita alteração (`409`). Vendas não são bloqueadas durante a contagem.

### 2.14 Caixa (4.8, 5.1, 5.2, 5.8, 5.9)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/caixa/atual` | todos | — | `{sessao: SessaoCaixa \| null}` — o caixa aberto do usuário logado |
| POST | `/caixa/abrir` | todos | `{fundo_troco: centavos (≥0), terminal?: "Caixa 1"}` | `201 {sessao: SessaoCaixa}` |
| POST | `/caixa/movimentos` | todos | `{tipo: "sangria"\|"suprimento", valor (>0), motivo?}` | `201 {id, sessao_caixa_id, tipo, valor, motivo, usuario_id, data_hora, sessao_numero, ...}` |
| POST | `/caixa/conferencia` | todos | `{valor_contado, contagem?}` | `{resumo: Resumo, valor_contado, valor_esperado, diferenca}` — não fecha |
| POST | `/caixa/fechar` | todos | `{valor_contado, observacao?, contagem?}` | `{sessao: SessaoCaixa}` (fechada) |
| GET | `/caixa/sessoes` | sup | `?situacao=aberto\|fechado&operador_id&inicio&fim&pagina&por_pagina` | lista (ver abaixo) — "Caixas abertos" = `situacao=aberto` |
| GET | `/caixa/sessoes/:id` | sup, ou o próprio operador | — | `SessaoCaixa` |
| POST | `/caixa/sessoes/:id/fechar` | sup | `{valor_contado, observacao?, contagem?}` | `{sessao}` — fechamento **forçado** quando a sessão é de outro operador |

- Um caixa aberto por usuário (`409 CAIXA_JA_ABERTO` com `sessao_caixa_id`). O caixa é do operador (vale em qualquer computador). Sair do sistema não fecha o caixa.
- **Caixa vencido** (aberto em dia anterior, no fuso da loja): `sessao.vencido: true`; vender, sangria e suprimento respondem `409 CAIXA_VENCIDO` — é preciso fechar. Abrir outro também dá `CAIXA_VENCIDO`.
- Sem caixa: `409 CAIXA_FECHADO` ("Caixa fechado. Abra o caixa para começar a vender.").
- Sangria: `motivo` obrigatório (≥ 3) e `valor` ≤ dinheiro esperado; suprimento: motivo opcional. Só no próprio caixa aberto e do dia.
- **Contagem cega**: para o perfil Caixa com sessão aberta, `resumo` **não** traz `esperado_dinheiro`, `dinheiro_recebido`, `troco` nem `vendas_por_forma.dinheiro`. Fluxo de fechamento: (1) pedir o contado; (2) `POST /caixa/conferencia` → mostrar resumo, esperado e diferença (sobra > 0, falta < 0); (3) se diferença ≠ 0, exigir observação (o operador pode recontar e chamar a conferência de novo); (4) `POST /caixa/fechar`. Fechar com diferença sem observação → `422 {codigo:"OBSERVACAO_OBRIGATORIA", diferenca, valor_esperado}`.
- `contagem` (opcional): `{"10000": 2, "5000": 1, "25": 4}` — chave = valor da cédula/moeda em centavos, valor = quantidade. A soma tem que bater com `valor_contado` (senão `422`).
- Sessão fechada não reabre nem se edita (`409`).
- Alerta de sangria: `sessao.alerta_sangria: true` quando o dinheiro esperado passa de `configuracoes.alerta_sangria_valor` (aviso; não bloqueia).

**SessaoCaixa**

```json
{ "id": "uuid", "numero": 79, "operador_id": "uuid", "operador_nome": "Carla Mendes", "terminal": "Caixa 1",
  "aberto_em": "ISO", "fundo_troco": 10000, "situacao": "aberto", "vencido": false,
  "fechado_em": null, "fechado_por": null, "fechado_por_nome": null, "valor_esperado": null, "valor_contado": null,
  "diferenca": null, "observacao_fechamento": null, "fechamento_forcado": false, "alerta_sangria": false,
  "resumo": {
    "fundo_troco": 10000,
    "vendas_por_forma": { "dinheiro": 10549, "debito": 0, "credito": 0, "pix": 0, "vale_troca": 0 },
    "dinheiro_recebido": 10549, "troco": 4426, "suprimentos": 0, "sangrias": 0, "estornos_dinheiro": 0,
    "quantidade_vendas": 3, "total_vendido": 6123, "canceladas": { "quantidade": 1, "valor": 5344 },
    "esperado_dinheiro": 16123 },
  "movimentos": [ { "id": "uuid", "tipo": "sangria|suprimento|estorno_dinheiro", "valor": 5000, "motivo": "Depósito no cofre",
                    "data_hora": "ISO", "usuario_id": "uuid", "usuario_nome": "…", "autorizador_id": null, "autorizador_nome": null,
                    "devolucao_id": null, "devolucao_numero": null } ] }
```

`vendas_por_forma.dinheiro` é o valor **recebido** em dinheiro (antes do troco). `esperado_dinheiro = fundo + dinheiro_recebido − troco + suprimentos − sangrias − estornos_dinheiro`. Vendas canceladas não entram. Em sessão fechada, `resumo` é o snapshot do fechamento e `valor_esperado/valor_contado/diferenca` vêm preenchidos.

Lista `/caixa/sessoes`: itens `{id, numero, operador_id, operador_nome, terminal, aberto_em, fundo_troco, situacao, fechado_em, valor_esperado, valor_contado, diferenca, fechamento_forcado, total_vendido, quantidade_vendas, vencido, minutos_aberto}`.

### 2.15 Autorização de supervisor (2.3)

| Método | Caminho | Perfil | Corpo | Resposta |
|---|---|---|---|---|
| POST | `/autorizacoes` | todos | `{acao, identificador, senha, percentual?, motivo?, detalhes?}` | `201 {token, acao, percentual, motivo, expira_em, autorizador: {id, nome, perfil}}` |

- `acao`: `desconto` (exige `percentual` — o percentual de desconto total da venda, até 2 casas), `remover_item` (exige `motivo`), `cancelar_venda_andamento` (exige `motivo`), `cancelar_venda` (exige `motivo`), `devolucao`.
- `identificador`/`senha`: e-mail ou CPF e senha do **gerente ou administrador**. Credencial errada → `401 CREDENCIAIS_INVALIDAS` (conta para o bloqueio do autorizador; 5 falhas → `429 BLOQUEADO`). Caixa como autorizador ou gerente com limite menor que o `percentual` → `403 AUTORIZACAO_NEGADA` (mensagem explica).
- O `token` vale **uma vez**, por 30 minutos, só para o operador logado e só para a `acao` pedida. Não troca o usuário logado. A autorização é auditada na hora (inclusive remoção de item de venda depois descartada).
- `detalhes` (livre) para registro — para `remover_item` recomenda-se `{descricao, quantidade, total}` (o `total` em centavos aparece no relatório R13).

### 2.16 Vendas (5.3–5.7, 5.10, 4.9)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| POST | `/vendas` | todos (com caixa aberto) | `FinalizarVenda` | `201 {venda: Venda, ja_registrada: false}` ou `200 {venda, ja_registrada: true}` (reenvio) |
| GET | `/vendas` | todos | `?inicio&fim (padrão hoje)&operador_id&forma&situacao=finalizada\|cancelada&cliente_id&numero&pagina&por_pagina` | lista + `totais` |
| GET | `/vendas/:id` | todos (Caixa: só da sessão aberta dele) | — | `Venda` |
| POST | `/vendas/:id/cancelar` | todos | `{motivo (≥3), token_autorizacao?}` | `Venda` (cancelada) |
| GET | `/vendas/:id/recibo` | todos (Caixa: só da sessão aberta) | `?segunda_via=true` | `Recibo` |
| POST | `/vendas/descartes` | todos | `{itens: [{produto_id?, descricao, quantidade, total}], total, motivo?, token_autorizacao?}` | `{ok:true}` — registra na auditoria uma venda em andamento cancelada |

**FinalizarVenda** — a venda em andamento vive só no terminal; envie tudo na finalização:

```json
{
  "id": "uuid gerado no terminal ao iniciar a venda (idempotência)",
  "terminal": "Caixa 1",
  "cliente_id": "uuid|null",
  "documento_recibo": "CPF/CNPJ só para o recibo|null",
  "itens": [
    { "produto_id": "uuid", "quantidade": 2, "preco_unitario": 2690, "desconto": 0 },
    { "produto_id": "uuid", "quantidade": "0,350", "preco_unitario": 1690, "desconto": 0 }
  ],
  "desconto_venda": 100,
  "pagamentos": [
    { "forma": "debito", "valor": 2000 },
    { "forma": "credito", "valor": 1000, "parcelas": 3, "observacao": "final 1234" },
    { "forma": "vale_troca", "valor": 500, "codigo_vale": "7Y54KWPV" },
    { "forma": "dinheiro", "valor": 5000 }
  ],
  "autorizacoes": ["token de POST /autorizacoes", "..."]
}
```

Regras aplicadas pelo servidor (tudo revalidado numa única transação):
- Caixa aberto e do dia (`CAIXA_FECHADO` / `CAIXA_VENCIDO`).
- `preco_unitario` = preço que o terminal mostrou. Se algum preço mudou → `409 {codigo:"PRECOS_ALTERADOS", precos_alterados: [{produto_id, nome, preco_informado, preco_atual}]}`: atualize os preços, mostre quais mudaram e peça confirmação.
- Produto inativo/excluído → `422`. Quantidade conforme unidade (`422` com `campos["itens.N.quantidade"]`).
- Estoque (se "vender sem estoque" estiver desligado), somando linhas do mesmo produto → `409 {codigo:"ESTOQUE_INSUFICIENTE", produto_id, disponivel}`.
- Cálculo (5.5/5.6): `total_bruto = arred(qtd × preço)`; `desconto` do item em centavos (0 ≤ desconto < bruto; o front converte % com `arred(bruto × % / 100)`); `desconto_venda` em centavos < subtotal (de % : `arred(subtotal × % / 100)`); rateio do desconto da venda pelos itens; `total ≥ 1`.
- **Limite de desconto**: `percentual = (Σ descontos de item + desconto_venda) / Σ brutos × 100` comparado ao limite do perfil logado. Acima → `403 {codigo:"AUTORIZACAO_NECESSARIA", acao:"desconto", percentual: 6.25 (2 casas, arredondado para cima), limite: 5}`. Peça `POST /autorizacoes {acao:"desconto", percentual}` e reenvie com o token em `autorizacoes`. Aumentou o desconto depois? Precisa de novo token com percentual maior.
- Tokens de `remover_item` enviados em `autorizacoes` ficam registrados na venda.
- Pagamentos (5.7): `valor > 0`. Débito, crédito, PIX e vale não podem passar do restante (soma deles ≤ total); só dinheiro gera troco (`troco = soma − total`); soma < total → `422` ("Ainda falta receber R$ X"). Crédito: `parcelas` de 1 a `max_parcelas_credito` (padrão 1); outras formas não aceitam parcelas ≠ 1. Vale-troca: `codigo_vale` obrigatório, vale ativo, dentro da validade e com saldo ≥ valor (vários vales permitidos; o mesmo vale pode aparecer em mais de um pagamento desde que a soma caiba no saldo).
- `cliente_id` precisa estar ativo; `documento_recibo` precisa ser CPF/CNPJ válido.
- **Idempotência**: reenviar o mesmo `id` (mesmo operador) devolve a venda já gravada com `200` e `ja_registrada: true`, sem duplicar.
- Efeitos: número sequencial, baixa de estoque (movimentação `venda`), consumo de saldo dos vales, auditoria.

**Venda**

```json
{ "id": "uuid", "numero": 1596, "sessao_caixa_id": "uuid", "sessao_numero": 80, "sessao_situacao": "aberto",
  "operador_id": "uuid", "operador_nome": "Ana Paula Ribeiro", "cliente_id": null, "cliente_nome": null, "cliente_documento": null,
  "documento_recibo": null, "terminal": "Caixa 3",
  "soma_bruto": 5972, "desconto_itens": 0, "subtotal": 5972, "desconto_venda": 100, "desconto_total": 100, "total": 5872, "troco": 1128,
  "situacao": "finalizada", "finalizada_em": "ISO", "cancelada_em": null, "cancelada_por": null, "cancelada_por_nome": null,
  "cancelamento_autorizado_por": null, "cancelamento_autorizado_por_nome": null, "motivo_cancelamento": null,
  "pode_cancelar": true, "criado_em": "ISO", "atualizado_em": "ISO",
  "itens": [ { "id": "uuid", "ordem": 1, "produto_id": "uuid", "descricao": "Arroz Tipo 1 5kg", "codigo_barras": "7891000000007",
               "unidade": "UN", "quantidade": 2, "preco_unitario": 2690, "total_bruto": 5380, "desconto": 0, "rateio_desconto": 91,
               "total_liquido": 5289, "quantidade_devolvida": 0, "valor_devolvido": 0, "quantidade_disponivel_devolucao": 2,
               "custo_unitario": 2050 } ],
  "pagamentos": [ { "id": "uuid", "ordem": 1, "forma": "debito", "valor": 2000, "parcelas": 1, "vale_troca_id": null, "codigo_vale": null, "observacao": null } ],
  "autorizacoes": [ { "id": "uuid", "tipo": "desconto_acima_limite|remover_item", "percentual": 6, "valor": 600, "motivo": null, "detalhes": null,
                      "data_hora": "ISO", "operador_id": "uuid", "operador_nome": "…", "autorizador_id": "uuid", "autorizador_nome": "…" } ],
  "devolucoes": [ { "id": "uuid", "numero": 3, "valor": 967, "destino": "vale_troca", "forma_estorno": null, "criado_em": "ISO" } ] }
```

(`custo_unitario` só para adm/ger. `valor` da autorização de desconto = desconto total em centavos.)

**Lista** `GET /vendas`: itens `{id, numero, finalizada_em, operador_id, operador_nome, cliente_id, cliente_nome, desconto_itens, desconto_venda, desconto_total, total, troco, situacao, sessao_caixa_id, formas: ["debito","dinheiro"], formas_resumo: "Débito + Dinheiro"}` e `totais: {quantidade, quantidade_finalizadas, soma_finalizadas}` (rodapé: soma só das finalizadas). Sem `inicio/fim` = hoje (`fim` padrão = `inicio`). Com `numero`, ignora o período. **Perfil Caixa** recebe só as vendas da sua sessão aberta (sem caixa aberto → lista vazia).

**Cancelar venda finalizada** (4.9): só enquanto a sessão de caixa da venda estiver aberta (`409 CAIXA_DA_VENDA_FECHADO` → orientar devolução) e sem devoluções (`409`). Perfil Caixa: só vendas do próprio caixa e com `token_autorizacao` de `acao:"cancelar_venda"` (sem token → `403 AUTORIZACAO_NECESSARIA`). Efeitos: estoque volta (`cancelamento_venda`), o dinheiro sai do esperado da sessão, saldo usado de vale volta ao vale (vale expirado ganha +30 dias a partir de hoje). `pode_cancelar` na venda indica se o botão deve aparecer.

**Descarte de venda em andamento** (5.10): adm/ger não precisam de token; Caixa precisa de `token_autorizacao` de `acao:"cancelar_venda_andamento"` (`403 AUTORIZACAO_NECESSARIA` sem ele). Venda vazia (`itens: []`) não precisa de autorização.

**Recibo** (5.12) — dados para o front montar o comprovante (58 mm, 80 mm, A4) e o Code 128:

```json
{ "empresa": { "nome_fantasia": "…", "razao_social": "…", "cnpj": "…", "telefone": "…", "whatsapp": "…", "logradouro": "…", "numero": "…",
               "complemento": "…", "bairro": "…", "cidade": "…", "uf": "SP", "cep": "…", "mensagem_rodape": "…", "fuso_horario": "America/Sao_Paulo",
               "tem_logo": true, "logo_url": "/api/empresa/logo" },
  "configuracao": { "papel_recibo": "80mm", "mostrar_logo_recibo": true, "imprimir_automaticamente": false, "vias_recibo": 1 },
  "aviso_nao_fiscal": "NÃO É DOCUMENTO FISCAL",
  "exemplo": false, "segunda_via": false, "cancelada": false,
  "venda": { "...todos os campos de Venda (sem custos)...": "", "operador_nome_curto": "Ana R.", "codigo_barras_venda": "1596" } }
```

Cabeçalho = dados **atuais** da empresa; itens, preços e pagamentos = os gravados. `?segunda_via=true` marca 2ª via e grava auditoria (`reimprimir`). Comprovantes de vale, sangria/suprimento, abertura e fechamento: monte com os dados de `/devolucoes/:id`, `/caixa/...` e o cabeçalho de `/configuracoes/recibo-teste` (campo `empresa`).

### 2.17 Trocas e devoluções (4.10)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/devolucoes/venda/:numero` | todos | número da venda (ou o código de barras do recibo) | `Venda` (qualquer sessão; sem custo para Caixa) |
| POST | `/devolucoes/simular` | todos | `{venda_id, itens: [{venda_item_id, quantidade, volta_estoque?}]}` | `{venda_id, venda_numero, valor, fora_do_prazo, dias_desde_venda, prazo_trocas_dias, precisa_autorizacao, itens: [{venda_item_id, descricao, quantidade, valor, volta_estoque}]}` |
| POST | `/devolucoes` | todos | `{venda_id, itens, destino: "vale_troca"\|"estorno", forma_estorno?: "dinheiro"\|"debito"\|"credito"\|"pix", motivo: "defeito"\|"arrependimento"\|"tamanho_modelo"\|"outro", motivo_texto?, token_autorizacao?}` | `201 Devolucao` |
| GET | `/devolucoes` | sup | `?inicio&fim&destino&motivo&venda_id&pagina&por_pagina` | lista de `{id, numero, criado_em, venda_id, venda_numero, cliente_id, cliente_nome, valor, destino, forma_estorno, motivo, motivo_texto, usuario_nome, vale_codigo}` |
| GET | `/devolucoes/:id` | todos | — | `Devolucao` |

- Venda precisa estar finalizada (cancelada → `409`). Quantidade ≤ vendida − já devolvida (`422`, o item traz `quantidade_disponivel_devolucao`). `volta_estoque` padrão true (false = avaria, sem movimentação).
- Valor por item = `arred(total_liquido × qtd / qtd_vendida)`; a devolução que zera o item usa o restante exato.
- **Autorização**: perfil Caixa sempre precisa de `token_autorizacao` com `acao:"devolucao"` → sem ele `403 AUTORIZACAO_NECESSARIA` (com `fora_do_prazo`). Gerente/admin dispensam, inclusive fora do prazo. `simular` informa `precisa_autorizacao` e `fora_do_prazo` antes.
- `destino:"vale_troca"`: cria vale (código de 8 caracteres sem 0/O/1/I), validade = hoje + `validade_vale_troca_dias`, vinculado ao cliente da venda. "Usar agora no caixa": abra a frente de caixa com pagamento `{forma:"vale_troca", codigo_vale}`.
- `destino:"estorno"` + `forma_estorno:"dinheiro"`: exige caixa aberto e do dia do usuário (`409 CAIXA_FECHADO`/`CAIXA_VENCIDO`) e dinheiro esperado suficiente (`409 DINHEIRO_INSUFICIENTE`); gera movimento `estorno_dinheiro`. Débito/crédito/PIX: só registro, não mexe no caixa.
- **Devolucao**: `{id, numero, venda_id, venda_numero, venda_data, cliente_id, cliente_nome, valor, destino, forma_estorno, motivo, motivo_texto, usuario_id, usuario_nome, autorizador_id, autorizador_nome, sessao_caixa_id, vale_troca_id, vale_codigo, vale_validade, vale_saldo, criado_em, itens: [{id, venda_item_id, produto_id, descricao, unidade, quantidade, valor, volta_estoque}]}`.

### 2.18 Vales-troca (3.16, 4.10)

| Método | Caminho | Perfil | Corpo / query | Resposta |
|---|---|---|---|---|
| GET | `/vales-troca` | todos | `?busca (código ou nome do cliente)&situacao=ativo\|usado\|expirado\|cancelado&cliente_id&pagina&por_pagina` | lista de `Vale` |
| GET | `/vales-troca/codigo/:codigo` | todos | — (usado no caixa para mostrar saldo) | `Vale` |
| GET | `/vales-troca/:id` | todos | — | `Vale` |
| POST | `/vales-troca/:id/cancelar` | adm | `{motivo}` | `Vale` |
| POST | `/vales-troca/:id/reativar` | adm | `{validade: "aaaa-mm-dd"}` (hoje ou futura) | `Vale` — estende a validade de vale expirado com saldo |

**Vale**: `{id, codigo, cliente_id, cliente_nome, valor_original, saldo, validade, situacao: "ativo"|"usado"|"expirado"|"cancelado", utilizavel, devolucao_id, devolucao_numero, venda_origem_numero, motivo_cancelamento, criado_em, ...}`. `expirado` é derivado (ativo com validade passada). No caixa, valor sugerido = `min(saldo, restante)`; aceite só se `utilizavel`.

### 2.19 Dashboard (4.11)

| Método | Caminho | Perfil | Query | Resposta |
|---|---|---|---|---|
| GET | `/dashboard` | sup | `periodo=7d\|30d\|12m` (padrão 7d; vale para o gráfico e os mais vendidos) | ver abaixo |

```json
{ "data_referencia": "2026-11-15",
  "hoje": { "total_vendido": 11995, "vendas_brutas": 11995, "devolucoes": 0, "numero_vendas": 4, "ticket_medio": 2999, "itens_vendidos": 8.407 },
  "mes": { "total_vendido": 1534843, "vendas_brutas": 1538429, "devolucoes": 3586, "numero_vendas": 358, "ticket_medio": 4287, "itens_vendidos": 1658.14,
           "mes_anterior_mesmo_periodo": { "inicio": "2026-10-01", "fim": "2026-10-15", "total_vendido": 1609518, "numero_vendas": 372 },
           "variacao_percentual": -4.6 },
  "grafico": { "periodo": "7d", "agrupamento": "dia", "pontos": [ { "data": "2026-11-09", "total": 120720, "numero_vendas": 24 } ] },
  "formas_pagamento": { "hoje": [ { "forma": "dinheiro", "valor": 9995, "percentual": 83.3 } ], "mes": [ "..." ] },
  "mais_vendidos": { "periodo": "7d", "inicio": "2026-11-09", "fim": "2026-11-15",
                     "por_quantidade": [ { "produto_id": "uuid", "nome": "…", "unidade": "UN", "quantidade": 115, "valor": 1722 } ],
                     "por_valor": [ "...top 10..." ] },
  "estoque_baixo": { "itens": [ "até 10, mesmo formato de /estoque/baixo" ], "total": 3 },
  "caixas_abertos": [ { "id": "uuid", "numero": 79, "operador_id": "uuid", "operador_nome": "Carla Mendes", "terminal": "Caixa 1",
                        "aberto_em": "ISO", "minutos_aberto": 91, "total_vendido": 6123, "quantidade_vendas": 3, "vencido": false } ] }
```

- `total_vendido = vendas finalizadas − devoluções` do período (devolução pela data dela); canceladas não contam. `ticket_medio = total_vendido ÷ numero_vendas` (0 se não há vendas). `variacao_percentual` = mês até hoje vs. mês anterior do dia 1 ao mesmo dia (`null` se o anterior é 0).
- Gráfico: 7 ou 30 pontos diários (`data` = dia), ou 12 mensais (`agrupamento: "mes"`, `data` = "aaaa-mm"), sempre com zeros nos dias sem venda; `total` já líquido de devoluções.
- Formas de pagamento: as 5 formas sempre presentes; dinheiro já líquido de troco.
- Atualize a cada 60 s. Perfil Caixa: `403` (a tela inicial dele é o caixa, com `/caixa/atual`).

### 2.20 Relatórios (7)

| Método | Caminho | Perfil | Query | Resposta |
|---|---|---|---|---|
| GET | `/relatorios` | sup | — | `{itens: [{codigo, slug, titulo, usa_periodo, filtros: [nomes]}]}` |
| GET | `/relatorios/:codigo` | sup | `inicio, fim` (aaaa-mm-dd; padrão mês atual; máx. 366 dias) + filtros + `formato=json\|csv` | JSON (abaixo) ou arquivo CSV |

`:codigo` aceita `R1`…`R13` (sem diferenciar maiúsculas) ou o slug. Período acima de 366 dias ou fim < início → `422`.

**JSON**:

```json
{ "codigo": "R1", "titulo": "Vendas por período", "periodo": { "inicio": "2026-11-01", "fim": "2026-11-14" }, "filtros": { "agrupar": "semana" },
  "colunas": [ { "chave": "periodo", "titulo": "Semana (início)", "tipo": "data" }, { "chave": "numero_vendas", "titulo": "Nº de vendas", "tipo": "inteiro" } ],
  "linhas": [ { "periodo": "2026-10-26", "numero_vendas": 12, "valor_bruto": 39534, "...": "" } ],
  "totais": { "numero_vendas": 354, "...": "" } }
```

`colunas[].tipo`: `texto | inteiro | moeda (centavos) | quantidade | percentual | data | data_hora (ISO) | booleano`. Renderize a tabela a partir de `colunas` + `linhas` e o rodapé a partir de `totais`. Linhas podem ter campos extras (ids) além das colunas. `periodo` é `null` em R7/R9 (não usam período).

**CSV** (`formato=csv`): UTF-8 com BOM, separador `;`, valores com vírgula decimal sem "R$", datas `dd/mm/aaaa` e `dd/mm/aaaa hh:mm` (fuso da loja), cabeçalho na 1ª linha, **sem** linha de totais. Arquivo: `<slug>_<inicio>_a_<fim>.csv` (cabeçalho `Content-Disposition`). Faça o download via `fetch` + blob ou link direto (o cookie vai junto).

| Cód. | Slug | Filtros | Colunas (chaves) | Totais |
|---|---|---|---|---|
| R1 | `vendas_por_periodo` | `agrupar=dia\|semana\|mes`, `operador_id` | periodo, numero_vendas, valor_bruto, descontos, devolucoes, total_liquido, ticket_medio | mesmas somas + ticket_medio geral |
| R2 | `vendas_por_forma_pagamento` | `operador_id` | forma_nome, numero_vendas, valor_recebido, percentual (linhas extras `detalhe:true` "Crédito em Nx" com `parcelas`) | valor_recebido, numero_vendas |
| R3 | `vendas_por_operador` | — | operador, numero_vendas, total_liquido, ticket_medio, descontos, itens_removidos, canceladas_quantidade, canceladas_valor | somas |
| R4 | `lista_de_vendas` | `operador_id, forma, situacao, cliente_id` | numero, data_hora, operador, cliente, formas, desconto, total, situacao | quantidade, quantidade_finalizadas, total e desconto (só finalizadas) |
| R5 | `produtos_vendidos` | `categoria_id` (ou `sem`), `operador_id` | codigo, produto, categoria, quantidade_vendida, quantidade_devolvida, faturamento_liquido, custo, lucro_bruto, margem (+ `sem_custo`) | somas + margem geral |
| R6 | `curva_abc` | `categoria_id` | posicao, produto, faturamento, percentual, percentual_acumulado, classe (A/B/C) | faturamento, produtos_a/b/c |
| R7 | `posicao_de_estoque` | `categoria_id, somente_baixo=true, somente_com_saldo=true` | codigo, nome, unidade, estoque_atual, estoque_minimo, preco_custo, valor_custo, preco_venda, valor_venda | itens, valor_custo, valor_venda |
| R8 | `movimentacoes_de_estoque` | `produto_id, tipo, usuario_id` | data_hora, produto, tipo_nome, quantidade (com sinal), saldo_anterior, saldo_posterior, usuario, origem | `por_tipo: {tipo: {entradas, saidas}}`, movimentacoes |
| R9 | `estoque_baixo` | `fornecedor_id, categoria_id` | nome, fornecedor_nome, estoque_atual, estoque_minimo, sugestao_compra, ultimo_custo, valor_estimado | valor_estimado |
| R10 | `fechamentos_de_caixa` | `operador_id` | numero, operador, abertura, fechamento, fundo_troco, dinheiro (líquido de troco), debito, credito, pix, vale_troca, suprimentos, sangrias, estornos, esperado, contado, diferenca, forcado | sessoes, sobras, faltas, diferenca |
| R11 | `movimentos_de_caixa` | `operador_id, tipo=sangria\|suprimento\|estorno_dinheiro` | data_hora, sessao, operador, tipo_nome, valor, motivo, autorizador | `por_tipo: {sangria, suprimento, estorno_dinheiro}` |
| R12 | `devolucoes_e_vales` | `destino, motivo` | numero, data, venda_origem, cliente, valor, destino_nome, forma_estorno_nome, motivo_nome, usuario | vale_troca, estorno, saldo_vales_ativos |
| R13 | `descontos_e_cancelamentos` | `operador_id` | data_hora, venda, operador, tipo_nome (desconto acima do limite / remoção de item / cancelamento de venda), valor, autorizador, motivo | `por_tipo: {tipo: {quantidade, valor}}` |

Regras: vendas pela data de finalização, devoluções pela data da devolução, canceladas fora dos totais (exceto R3/R4/R13 que as listam). R5: faturamento = Σ líquidos − devolvido; custo = (qtd vendida − devolvida) × custo copiado na venda; margem vazia (`null`) se faturamento 0 ou item sem custo. R2: soma das formas = soma dos totais das vendas. R10: diferença = contado − esperado.

---

## 3. Fluxos de tela → chamadas (resumo para o front)

1. **Abertura do app**: `GET /primeiro-acesso` → se `necessario`, assistente (`POST /primeiro-acesso`). Senão `GET /auth/eu` (401 → login). Com `deve_trocar_senha`, só a tela de troca (`POST /auth/senha`).
2. **Frente de caixa**: `GET /caixa/atual` (null → abrir; `vencido` → aviso e fechamento). Leitor: `GET /produtos/codigo/:codigo` (404 → aviso sonoro + mensagem). F2: `GET /produtos/busca?q=`. Cliente (F3): `GET /clientes?busca=` ou `POST /clientes`. Vale: `GET /vales-troca/codigo/:codigo`. Desconto/remoção acima do permitido: `POST /autorizacoes` e guarde o token na venda local. Finalizar: `POST /vendas` (trate `PRECOS_ALTERADOS`, `ESTOQUE_INSUFICIENTE`, `AUTORIZACAO_NECESSARIA`; em erro de rede, reenvie com o mesmo `id`). Recibo: `GET /vendas/:id/recibo`. Descartar venda: `POST /vendas/descartes`. F9: `POST /caixa/movimentos`. Fechar: `POST /caixa/conferencia` → `POST /caixa/fechar`.
3. **Limites e permissões no front**: use `GET /configuracoes` (limites, parcelas, vender sem estoque, exigir autorização para remover item) para decidir quando abrir a janela de autorização antes de chamar a API; a API valida de novo.
4. **Troca**: `GET /devolucoes/venda/:numero` → `POST /devolucoes/simular` → (Caixa: `POST /autorizacoes {acao:"devolucao"}`) → `POST /devolucoes` → se vale, "usar agora no caixa".
