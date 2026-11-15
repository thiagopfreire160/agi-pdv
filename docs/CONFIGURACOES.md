# Resumo de configurações

O NEXO se configura em dois lugares: o arquivo `.env` da API, para o servidor, e a tela **Configurações** do sistema, para as regras da loja.

## 1. Arquivo `apps/api/.env` (servidor)

Copie `apps/api/.env.example` para `apps/api/.env`. Sem esse arquivo, o sistema usa os padrões abaixo, que servem para testar no próprio computador.

| Variável | Padrão | Para que serve | Mude quando |
|---|---|---|---|
| `DATABASE_URL` | `postgres://postgres:nexo@localhost:5432/nexo` | endereço do banco | o banco tiver outra senha ou estiver em outra máquina |
| `DATABASE_URL_TESTE` | `.../nexo_test` | banco dos testes automáticos | só para desenvolvimento |
| `PORTA` | `3333` | porta da API | a porta já estiver em uso |
| `HOST` | `0.0.0.0` | aceita conexões de outros computadores da rede | quiser restringir ao próprio computador (`127.0.0.1`) |
| `SEGREDO_SESSAO` | texto de exemplo | protege as sessões de login | **sempre, antes de usar na loja**: coloque 32 ou mais caracteres aleatórios |
| `ORIGEM_WEB` | `http://localhost:5173` | endereços extras autorizados a abrir o sistema | o front estiver em outro endereço (no modo loja, porta 3333, não precisa mudar); separe por vírgula |
| `COOKIE_SEGURO` | `false` | exige HTTPS no cookie de login | o sistema estiver publicado com HTTPS |
| `NIVEL_LOG` | `info` | quantidade de detalhes no log | investigar um problema (`debug`) |

## 2. Tela Configurações (regras da loja)

Só o administrador altera estas regras. As mudanças valem na hora.

### Caixa e vendas

| Configuração | Padrão | Observação |
|---|---|---|
| Limite de desconto do perfil Caixa | 5% | acima disso, pede gerente |
| Limite de desconto do perfil Gerente | 20% | acima disso, pede administrador |
| Exigir autorização para remover item | sim | vale para o perfil Caixa |
| Permitir vender sem estoque | não | ligue se o cadastro de estoque ainda não estiver em dia |
| Máximo de parcelas no crédito | 12 | de 1 a 24 |
| Alerta de sangria | desligado | avisa quando o dinheiro na gaveta passa do valor definido |

### Trocas

| Configuração | Padrão |
|---|---|
| Prazo para trocas e devoluções | 30 dias (0 = sem limite) |
| Validade do vale-troca | 90 dias |

### Recibo

| Configuração | Padrão |
|---|---|
| Papel | 80 mm (também 58 mm e A4) |
| Mostrar logo da empresa | sim |
| Imprimir sozinho ao finalizar | não |
| Vias | 1 |

### Segurança

| Configuração | Padrão |
|---|---|
| Duração da sessão | 12 horas |
| Encerrar por inatividade | desligado |
| Tentativas de login antes de bloquear | 5 |
| Tempo de bloqueio | 10 minutos |

Na mesma tela ficam as sessões ativas (dá para encerrar a de outro computador) e a trilha de auditoria, que registra quem alterou o quê e quando.

### Aparência

Tema claro ou escuro. Cada usuário escolhe o seu, e a escolha também pode ser trocada pelo botão no topo da tela.

## 3. Minha empresa

Razão social, nome fantasia, CNPJ, endereço, telefone e logo. Esses dados saem no cabeçalho do recibo. O logo aceita PNG ou JPG de até 1 MB.

## 4. Perfis

Os três perfis (Administrador, Gerente e Caixa) têm permissões fixas na v1. A tabela completa está na seção 2.2 de [especificacao.md](especificacao.md). Para personalizar permissões por usuário, veja [PENDENCIAS.md](PENDENCIAS.md).
