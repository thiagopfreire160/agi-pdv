# O que falta integrar depois da v1

Lista em ordem de prioridade sugerida. Cada item novo começa com uma entrada na especificação (`docs/especificacao.md`) e só depois vira código.

## Antes de usar na loja de verdade

| Item | Por quê | Esforço |
|---|---|---|
| Trocar `SEGREDO_SESSAO` e a senha do banco | os valores de exemplo são públicos | minutos |
| Rotina de backup do banco (`pg_dump` diário em outra máquina ou na nuvem) | hoje não há backup automático | baixo |
| Testar a impressão em impressora térmica real (58 e 80 mm) | o layout foi conferido só na prévia do navegador | baixo |
| Separar o banco de testes do banco da loja | os testes de ponta a ponta (Playwright) gravam vendas no banco `nexo`; nunca rode-os apontando para a loja | baixo |
| HTTPS, se o sistema for acessado fora da rede da loja (`COOKIE_SEGURO=true`) | proteger senhas em trânsito | médio |

## Pequenos ajustes já mapeados na v1

- Operador de caixa contar inventário quando for designado (a regra existe na especificação; falta a tela para esse perfil).
- Cadastrar o produto na hora, pelo gerente, quando o código lido no caixa não existir.
- Na lista de movimentações de estoque, link para a venda ou entrada que originou cada uma.
- Filtro por cliente no histórico de vendas e no relatório de vendas por cliente.
- A API oferece vendas por período só em 7 dias, 30 dias e 12 meses. O agrupamento semanal do gráfico é montado no front. Uma rota própria deixaria isso mais simples.
- Testes automáticos das telas de troca de senha obrigatória e de caixa vencido.

## Integrações (v2 em diante)

| Integração | O que envolve |
|---|---|
| **Fiscal: NFC-e e NF-e** | cadastro tributário do produto (NCM, CFOP, CST), certificado digital A1, emissão por um provedor (ex.: Focus NFe, NFE.io, PlugNotas) ou biblioteca própria, contingência offline |
| **Maquininha / TEF** | integração com o adquirente (Stone, Cielo, Rede, PagSeguro, Mercado Pago Point) para o valor ir direto à maquininha e a venda fechar com a aprovação; conciliação de cartões |
| **PIX com QR Code dinâmico** | PSP ou banco com API PIX (cobrança imediata e webhook de confirmação); a venda fecha quando o pagamento cai |
| **Boleto e gateways** | só se houver venda a prazo ou loja virtual |
| **E-mail (SMTP)** | recuperação de senha por e-mail e envio de recibo ao cliente |
| **Balança** | etiqueta com preço ou peso embutido no código de barras (prefixo 2) e leitura direta da balança no caixa |
| **Modo offline do caixa** | continuar vendendo quando a rede cair e sincronizar depois |

## Funções de negócio (v2 em diante)

- Venda a prazo (fiado ou crediário), contas a pagar e a receber, fluxo de caixa.
- Pedido de compra ao fornecedor e sugestão de reposição.
- Promoções programadas, tabelas de preço e preço por quantidade.
- Produtos com grade (tamanho e cor), kits, lote e validade.
- Etiquetas de gôndola e de código de barras.
- Programa de fidelidade.
- Várias lojas no mesmo sistema.
- Loja virtual e marketplaces.
- Permissões personalizadas por usuário.
- Aplicativo para celular.
