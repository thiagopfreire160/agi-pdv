import { sql, type Kysely } from 'kysely';

// Esquema inicial da v1. Valores em centavos (integer/bigint), quantidades numeric(14,3),
// datas/horas em timestamptz (UTC).
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    CREATE EXTENSION IF NOT EXISTS unaccent;

    -- unaccent não é IMMUTABLE; este invólucro permite usá-lo em índices.
    CREATE OR REPLACE FUNCTION f_normalizar(texto text) RETURNS text
      LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
      $$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(texto, ''))) $$;

    CREATE SEQUENCE seq_venda;
    CREATE SEQUENCE seq_entrada;
    CREATE SEQUENCE seq_devolucao;
    CREATE SEQUENCE seq_inventario;
    CREATE SEQUENCE seq_caixa;
    CREATE SEQUENCE seq_codigo_produto;

    CREATE TABLE usuarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome varchar(80) NOT NULL,
      email varchar(120) NOT NULL,
      cpf varchar(11),
      telefone varchar(11),
      perfil varchar(15) NOT NULL CHECK (perfil IN ('administrador','gerente','caixa')),
      senha_hash text NOT NULL,
      deve_trocar_senha boolean NOT NULL DEFAULT true,
      ativo boolean NOT NULL DEFAULT true,
      ultimo_acesso timestamptz,
      tema varchar(10) NOT NULL DEFAULT 'sistema' CHECK (tema IN ('claro','escuro','sistema')),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX usuarios_email_uk ON usuarios (lower(email));
    CREATE UNIQUE INDEX usuarios_cpf_uk ON usuarios (cpf) WHERE cpf IS NOT NULL;

    CREATE TABLE empresa (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unico boolean NOT NULL DEFAULT true UNIQUE CHECK (unico),
      nome_fantasia varchar(80) NOT NULL,
      razao_social varchar(120),
      cnpj varchar(14) NOT NULL,
      inscricao_estadual varchar(20),
      telefone varchar(11),
      whatsapp varchar(11),
      email varchar(120),
      site varchar(120),
      cep varchar(8),
      logradouro varchar(120),
      numero varchar(10),
      complemento varchar(60),
      bairro varchar(60),
      cidade varchar(60),
      uf varchar(2),
      logo bytea,
      logo_tipo varchar(20),
      mensagem_rodape varchar(200),
      fuso_horario varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );

    CREATE TABLE configuracoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      unico boolean NOT NULL DEFAULT true UNIQUE CHECK (unico),
      limite_desconto_caixa numeric(5,2) NOT NULL DEFAULT 5,
      limite_desconto_gerente numeric(5,2) NOT NULL DEFAULT 20,
      exigir_autorizacao_remover_item boolean NOT NULL DEFAULT true,
      permitir_vender_sem_estoque boolean NOT NULL DEFAULT false,
      max_parcelas_credito integer NOT NULL DEFAULT 12,
      validade_vale_troca_dias integer NOT NULL DEFAULT 90,
      prazo_trocas_dias integer NOT NULL DEFAULT 30,
      alerta_sangria_valor integer NOT NULL DEFAULT 0,
      papel_recibo varchar(5) NOT NULL DEFAULT '80mm' CHECK (papel_recibo IN ('58mm','80mm','A4')),
      mostrar_logo_recibo boolean NOT NULL DEFAULT true,
      imprimir_automaticamente boolean NOT NULL DEFAULT false,
      vias_recibo integer NOT NULL DEFAULT 1,
      duracao_sessao_horas integer NOT NULL DEFAULT 12,
      inatividade_minutos integer NOT NULL DEFAULT 0,
      tentativas_login integer NOT NULL DEFAULT 5,
      tempo_bloqueio_minutos integer NOT NULL DEFAULT 10,
      versao integer NOT NULL DEFAULT 1,
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );

    CREATE TABLE sessoes_login (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id uuid NOT NULL REFERENCES usuarios(id),
      token_hash char(64) NOT NULL UNIQUE,
      criada_em timestamptz NOT NULL DEFAULT now(),
      expira_em timestamptz NOT NULL,
      ultimo_uso timestamptz NOT NULL DEFAULT now(),
      ip varchar(60),
      navegador varchar(300),
      encerrada_em timestamptz,
      motivo_encerramento varchar(20)
    );
    CREATE INDEX sessoes_login_usuario_ix ON sessoes_login (usuario_id) WHERE encerrada_em IS NULL;

    CREATE TABLE tentativas_login (
      chave varchar(200) PRIMARY KEY,
      falhas integer NOT NULL DEFAULT 0,
      janela_inicio timestamptz NOT NULL DEFAULT now(),
      bloqueado_ate timestamptz
    );

    CREATE TABLE auditoria (
      id bigserial PRIMARY KEY,
      data_hora timestamptz NOT NULL DEFAULT now(),
      usuario_id uuid REFERENCES usuarios(id),
      autorizador_id uuid REFERENCES usuarios(id),
      entidade varchar(40) NOT NULL,
      entidade_id varchar(60),
      acao varchar(40) NOT NULL,
      antes jsonb,
      depois jsonb,
      ip varchar(60)
    );
    CREATE INDEX auditoria_data_ix ON auditoria (data_hora);
    CREATE INDEX auditoria_entidade_ix ON auditoria (entidade, entidade_id);

    CREATE TABLE categorias (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome varchar(50) NOT NULL,
      ativo boolean NOT NULL DEFAULT true,
      excluido_em timestamptz,
      excluido_por uuid REFERENCES usuarios(id),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX categorias_nome_uk ON categorias (f_normalizar(nome)) WHERE excluido_em IS NULL;

    CREATE TABLE fornecedores (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome_fantasia varchar(80) NOT NULL,
      razao_social varchar(120),
      documento varchar(14),
      contato varchar(80),
      telefone varchar(11),
      email varchar(120),
      cep varchar(8), logradouro varchar(120), numero varchar(10), complemento varchar(60),
      bairro varchar(60), cidade varchar(60), uf varchar(2),
      observacoes varchar(500),
      ativo boolean NOT NULL DEFAULT true,
      excluido_em timestamptz,
      excluido_por uuid REFERENCES usuarios(id),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX fornecedores_documento_uk ON fornecedores (documento) WHERE documento IS NOT NULL AND excluido_em IS NULL;

    CREATE TABLE produtos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo varchar(20) NOT NULL,
      codigo_barras varchar(14),
      nome varchar(80) NOT NULL,
      categoria_id uuid REFERENCES categorias(id),
      unidade varchar(3) NOT NULL DEFAULT 'UN',
      preco_venda integer NOT NULL CHECK (preco_venda > 0),
      preco_custo integer NOT NULL DEFAULT 0 CHECK (preco_custo >= 0),
      estoque_atual numeric(14,3) NOT NULL DEFAULT 0,
      estoque_minimo numeric(14,3) NOT NULL DEFAULT 0,
      controla_estoque boolean NOT NULL DEFAULT true,
      fornecedor_id uuid REFERENCES fornecedores(id),
      observacoes varchar(500),
      ativo boolean NOT NULL DEFAULT true,
      excluido_em timestamptz,
      excluido_por uuid REFERENCES usuarios(id),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX produtos_codigo_uk ON produtos (codigo) WHERE excluido_em IS NULL;
    CREATE UNIQUE INDEX produtos_barras_uk ON produtos (codigo_barras) WHERE codigo_barras IS NOT NULL AND excluido_em IS NULL;
    CREATE INDEX produtos_nome_ix ON produtos (f_normalizar(nome));

    CREATE TABLE clientes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      nome varchar(120) NOT NULL,
      documento varchar(14),
      celular varchar(11),
      telefone varchar(11),
      email varchar(120),
      data_nascimento date,
      cep varchar(8), logradouro varchar(120), numero varchar(10), complemento varchar(60),
      bairro varchar(60), cidade varchar(60), uf varchar(2),
      observacoes varchar(500),
      ativo boolean NOT NULL DEFAULT true,
      excluido_em timestamptz,
      excluido_por uuid REFERENCES usuarios(id),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX clientes_documento_uk ON clientes (documento) WHERE documento IS NOT NULL AND excluido_em IS NULL;

    CREATE TABLE sessoes_caixa (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      numero integer NOT NULL UNIQUE DEFAULT nextval('seq_caixa'),
      operador_id uuid NOT NULL REFERENCES usuarios(id),
      terminal varchar(30),
      aberto_em timestamptz NOT NULL DEFAULT now(),
      fundo_troco integer NOT NULL CHECK (fundo_troco >= 0),
      situacao varchar(10) NOT NULL DEFAULT 'aberto' CHECK (situacao IN ('aberto','fechado')),
      fechado_em timestamptz,
      fechado_por uuid REFERENCES usuarios(id),
      valor_esperado integer,
      valor_contado integer,
      diferenca integer,
      resumo jsonb,
      observacao_fechamento varchar(500),
      fechamento_forcado boolean NOT NULL DEFAULT false,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE UNIQUE INDEX sessoes_caixa_um_aberto_uk ON sessoes_caixa (operador_id) WHERE situacao = 'aberto';

    CREATE TABLE autorizacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      token_hash char(64) NOT NULL UNIQUE,
      acao varchar(40) NOT NULL,
      operador_id uuid NOT NULL REFERENCES usuarios(id),
      autorizador_id uuid NOT NULL REFERENCES usuarios(id),
      percentual numeric(7,2),
      motivo varchar(200),
      detalhes jsonb,
      criada_em timestamptz NOT NULL DEFAULT now(),
      expira_em timestamptz NOT NULL,
      usada_em timestamptz
    );

    CREATE TABLE vendas (
      id uuid PRIMARY KEY,
      numero integer NOT NULL UNIQUE,
      sessao_caixa_id uuid NOT NULL REFERENCES sessoes_caixa(id),
      operador_id uuid NOT NULL REFERENCES usuarios(id),
      cliente_id uuid REFERENCES clientes(id),
      documento_recibo varchar(14),
      terminal varchar(30),
      soma_bruto integer NOT NULL,
      subtotal integer NOT NULL,
      desconto_itens integer NOT NULL DEFAULT 0,
      desconto_venda integer NOT NULL DEFAULT 0,
      total integer NOT NULL CHECK (total > 0),
      troco integer NOT NULL DEFAULT 0,
      situacao varchar(12) NOT NULL DEFAULT 'finalizada' CHECK (situacao IN ('finalizada','cancelada')),
      finalizada_em timestamptz NOT NULL DEFAULT now(),
      cancelada_em timestamptz,
      cancelada_por uuid REFERENCES usuarios(id),
      cancelamento_autorizado_por uuid REFERENCES usuarios(id),
      motivo_cancelamento varchar(200),
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );
    CREATE INDEX vendas_finalizada_ix ON vendas (finalizada_em);
    CREATE INDEX vendas_sessao_ix ON vendas (sessao_caixa_id);

    CREATE TABLE vendas_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid NOT NULL REFERENCES vendas(id),
      ordem integer NOT NULL,
      produto_id uuid NOT NULL REFERENCES produtos(id),
      descricao varchar(80) NOT NULL,
      codigo_barras varchar(14),
      unidade varchar(3) NOT NULL,
      quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
      preco_unitario integer NOT NULL,
      custo_unitario integer NOT NULL DEFAULT 0,
      total_bruto integer NOT NULL,
      desconto integer NOT NULL DEFAULT 0,
      rateio_desconto integer NOT NULL DEFAULT 0,
      total_liquido integer NOT NULL,
      quantidade_devolvida numeric(14,3) NOT NULL DEFAULT 0,
      valor_devolvido integer NOT NULL DEFAULT 0
    );
    CREATE INDEX vendas_itens_venda_ix ON vendas_itens (venda_id);
    CREATE INDEX vendas_itens_produto_ix ON vendas_itens (produto_id);

    CREATE TABLE vales_troca (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      codigo varchar(8) NOT NULL UNIQUE,
      cliente_id uuid REFERENCES clientes(id),
      valor_original integer NOT NULL CHECK (valor_original > 0),
      saldo integer NOT NULL CHECK (saldo >= 0),
      validade date NOT NULL,
      situacao varchar(10) NOT NULL DEFAULT 'ativo' CHECK (situacao IN ('ativo','usado','cancelado')),
      devolucao_id uuid,
      motivo_cancelamento varchar(200),
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );

    CREATE TABLE vendas_pagamentos (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid NOT NULL REFERENCES vendas(id),
      ordem integer NOT NULL,
      forma varchar(12) NOT NULL CHECK (forma IN ('dinheiro','debito','credito','pix','vale_troca')),
      valor integer NOT NULL CHECK (valor > 0),
      parcelas integer NOT NULL DEFAULT 1,
      vale_troca_id uuid REFERENCES vales_troca(id),
      observacao varchar(60)
    );
    CREATE INDEX vendas_pagamentos_venda_ix ON vendas_pagamentos (venda_id);

    CREATE TABLE vendas_autorizacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      venda_id uuid NOT NULL REFERENCES vendas(id),
      autorizacao_id uuid REFERENCES autorizacoes(id),
      tipo varchar(30) NOT NULL,
      operador_id uuid NOT NULL REFERENCES usuarios(id),
      autorizador_id uuid NOT NULL REFERENCES usuarios(id),
      percentual numeric(7,2),
      valor integer,
      motivo varchar(200),
      detalhes jsonb,
      data_hora timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE devolucoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      numero integer NOT NULL UNIQUE DEFAULT nextval('seq_devolucao'),
      venda_id uuid NOT NULL REFERENCES vendas(id),
      cliente_id uuid REFERENCES clientes(id),
      valor integer NOT NULL,
      destino varchar(12) NOT NULL CHECK (destino IN ('vale_troca','estorno')),
      forma_estorno varchar(10) CHECK (forma_estorno IN ('dinheiro','debito','credito','pix')),
      motivo varchar(20) NOT NULL CHECK (motivo IN ('defeito','arrependimento','tamanho_modelo','outro')),
      motivo_texto varchar(200),
      usuario_id uuid NOT NULL REFERENCES usuarios(id),
      autorizador_id uuid REFERENCES usuarios(id),
      sessao_caixa_id uuid REFERENCES sessoes_caixa(id),
      vale_troca_id uuid REFERENCES vales_troca(id),
      criado_em timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX devolucoes_venda_ix ON devolucoes (venda_id);
    CREATE INDEX devolucoes_data_ix ON devolucoes (criado_em);
    ALTER TABLE vales_troca ADD CONSTRAINT vales_devolucao_fk FOREIGN KEY (devolucao_id) REFERENCES devolucoes(id);

    CREATE TABLE devolucoes_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      devolucao_id uuid NOT NULL REFERENCES devolucoes(id),
      venda_item_id uuid NOT NULL REFERENCES vendas_itens(id),
      produto_id uuid NOT NULL REFERENCES produtos(id),
      quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
      valor integer NOT NULL,
      volta_estoque boolean NOT NULL DEFAULT true
    );

    CREATE TABLE movimentos_caixa (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sessao_caixa_id uuid NOT NULL REFERENCES sessoes_caixa(id),
      tipo varchar(20) NOT NULL CHECK (tipo IN ('suprimento','sangria','estorno_dinheiro')),
      valor integer NOT NULL CHECK (valor > 0),
      motivo varchar(120),
      usuario_id uuid NOT NULL REFERENCES usuarios(id),
      autorizador_id uuid REFERENCES usuarios(id),
      devolucao_id uuid REFERENCES devolucoes(id),
      data_hora timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX movimentos_caixa_sessao_ix ON movimentos_caixa (sessao_caixa_id);

    CREATE TABLE entradas (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      numero integer NOT NULL UNIQUE DEFAULT nextval('seq_entrada'),
      fornecedor_id uuid REFERENCES fornecedores(id),
      numero_nota varchar(30),
      data_recebimento date NOT NULL,
      atualizar_custo boolean NOT NULL DEFAULT true,
      observacoes varchar(500),
      situacao varchar(12) NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho','confirmada')),
      confirmada_em timestamptz,
      confirmada_por uuid REFERENCES usuarios(id),
      versao integer NOT NULL DEFAULT 1,
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );

    CREATE TABLE entradas_itens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      entrada_id uuid NOT NULL REFERENCES entradas(id),
      ordem integer NOT NULL,
      produto_id uuid NOT NULL REFERENCES produtos(id),
      quantidade numeric(14,3) NOT NULL CHECK (quantidade > 0),
      custo_unitario integer NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0)
    );

    CREATE TABLE inventarios (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      numero integer NOT NULL UNIQUE DEFAULT nextval('seq_inventario'),
      descricao varchar(80) NOT NULL,
      abrangencia varchar(12) NOT NULL CHECK (abrangencia IN ('todos','categoria','selecionados')),
      categoria_ids uuid[] NOT NULL DEFAULT '{}',
      usuarios_designados uuid[] NOT NULL DEFAULT '{}',
      situacao varchar(12) NOT NULL DEFAULT 'em_contagem' CHECK (situacao IN ('em_contagem','finalizado','cancelado')),
      nao_contados varchar(10),
      finalizado_em timestamptz,
      finalizado_por uuid REFERENCES usuarios(id),
      cancelado_em timestamptz,
      cancelado_por uuid REFERENCES usuarios(id),
      criado_em timestamptz NOT NULL DEFAULT now(),
      criado_por uuid REFERENCES usuarios(id),
      atualizado_em timestamptz NOT NULL DEFAULT now(),
      atualizado_por uuid REFERENCES usuarios(id)
    );

    CREATE TABLE inventarios_itens (
      inventario_id uuid NOT NULL REFERENCES inventarios(id),
      produto_id uuid NOT NULL REFERENCES produtos(id),
      quantidade_contada numeric(14,3),
      estoque_no_fechamento numeric(14,3),
      contado_por uuid REFERENCES usuarios(id),
      contado_em timestamptz,
      PRIMARY KEY (inventario_id, produto_id)
    );

    CREATE TABLE movimentacoes_estoque (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      sequencia bigserial NOT NULL,
      produto_id uuid NOT NULL REFERENCES produtos(id),
      tipo varchar(20) NOT NULL CHECK (tipo IN ('estoque_inicial','entrada','ajuste_mais','ajuste_menos','inventario','venda','cancelamento_venda','devolucao')),
      quantidade numeric(14,3) NOT NULL,
      saldo_anterior numeric(14,3) NOT NULL,
      saldo_posterior numeric(14,3) NOT NULL,
      custo_unitario integer,
      motivo varchar(30),
      motivo_texto varchar(200),
      origem_tipo varchar(20),
      origem_id uuid,
      usuario_id uuid NOT NULL REFERENCES usuarios(id),
      data_hora timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX movimentacoes_produto_ix ON movimentacoes_estoque (produto_id, sequencia);
    CREATE INDEX movimentacoes_data_ix ON movimentacoes_estoque (data_hora);
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Migração inicial não pode ser desfeita.');
}
