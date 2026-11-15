// Tipos das respostas da API (docs/api.md).

export type Perfil = 'administrador' | 'gerente' | 'caixa'
export type Tema = 'claro' | 'escuro' | 'sistema'
export type Forma = 'dinheiro' | 'debito' | 'credito' | 'pix' | 'vale_troca'

export interface Lista<T> {
  itens: T[]
  total: number
  pagina: number
  por_pagina: number
}

export interface Usuario {
  id: string
  nome: string
  email: string
  cpf: string | null
  telefone: string | null
  perfil: Perfil
  deve_trocar_senha: boolean
  ativo: boolean
  ultimo_acesso: string | null
  tema: Tema
  versao: number
  criado_em: string
}

export interface Eu {
  usuario: Usuario
  empresa: { nome_fantasia: string; fuso_horario: string; tem_logo: boolean } | null
  caixa_aberto: { id: string; numero: number; aberto_em: string; vencido: boolean } | null
  tela_inicial: 'trocar_senha' | 'dashboard' | 'caixa'
}

export interface Empresa {
  id: string
  nome_fantasia: string
  razao_social: string | null
  cnpj: string
  inscricao_estadual: string | null
  telefone: string | null
  whatsapp: string | null
  email: string | null
  site: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  mensagem_rodape: string | null
  fuso_horario: string
  versao: number
  atualizado_em: string
  tem_logo: boolean
}

export interface Configuracoes {
  limite_desconto_caixa: number
  limite_desconto_gerente: number
  limite_desconto_administrador: number
  exigir_autorizacao_remover_item: boolean
  permitir_vender_sem_estoque: boolean
  max_parcelas_credito: number
  validade_vale_troca_dias: number
  prazo_trocas_dias: number
  alerta_sangria_valor: number
  papel_recibo: '58mm' | '80mm' | 'A4'
  mostrar_logo_recibo: boolean
  imprimir_automaticamente: boolean
  vias_recibo: number
  duracao_sessao_horas: number
  inatividade_minutos: number
  tentativas_login: number
  tempo_bloqueio_minutos: number
  versao: number
  atualizado_em: string
}

export interface Categoria {
  id: string
  nome: string
  ativo: boolean
  versao: number
  quantidade_produtos: number
}

export interface Produto {
  id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  categoria_id: string | null
  categoria_nome: string | null
  unidade: string
  fracionavel: boolean
  preco_venda: number
  estoque_atual: number
  estoque_minimo: number
  estoque_baixo: boolean
  controla_estoque: boolean
  fornecedor_id: string | null
  fornecedor_nome: string | null
  observacoes: string | null
  ativo: boolean
  versao: number
  criado_em: string
  atualizado_em: string
  preco_custo?: number
  margem?: number | null
  preco_abaixo_do_custo?: boolean
}

export interface Endereco {
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
}

export interface Cliente extends Endereco {
  id: string
  nome: string
  documento: string | null
  tipo_pessoa: 'fisica' | 'juridica' | null
  celular: string | null
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  observacoes: string | null
  saldo_credito: number
  ativo: boolean
  versao: number
  criado_em: string
  atualizado_em: string
  ultimas_compras?: { id: string; numero: number; finalizada_em: string; total: number; situacao: string }[]
  vales_ativos?: { id: string; codigo: string; valor_original: number; saldo: number; validade: string; situacao: string }[]
}

export interface Fornecedor extends Endereco {
  id: string
  nome_fantasia: string
  razao_social: string | null
  documento: string | null
  contato: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  ativo: boolean
  versao: number
  produtos?: { id: string; codigo: string; nome: string; estoque_atual: number; estoque_minimo: number; preco_custo: number; ativo: boolean }[]
  ultimas_entradas?: { id: string; numero: number; data_recebimento: string; numero_nota: string | null; situacao: string; total: number }[]
}

export interface ResumoCaixa {
  fundo_troco: number
  vendas_por_forma: Partial<Record<Forma, number>>
  dinheiro_recebido?: number
  troco?: number
  suprimentos: number
  sangrias: number
  estornos_dinheiro: number
  quantidade_vendas: number
  total_vendido: number
  canceladas: { quantidade: number; valor: number }
  esperado_dinheiro?: number
}

export interface MovimentoCaixa {
  id: string
  tipo: 'sangria' | 'suprimento' | 'estorno_dinheiro'
  valor: number
  motivo: string | null
  data_hora: string
  usuario_id: string
  usuario_nome: string
  autorizador_nome: string | null
  devolucao_numero: number | null
}

export interface SessaoCaixa {
  id: string
  numero: number
  operador_id: string
  operador_nome: string
  terminal: string | null
  aberto_em: string
  fundo_troco: number
  situacao: 'aberto' | 'fechado'
  vencido: boolean
  fechado_em: string | null
  fechado_por_nome: string | null
  valor_esperado: number | null
  valor_contado: number | null
  diferenca: number | null
  observacao_fechamento: string | null
  fechamento_forcado: boolean
  alerta_sangria: boolean
  resumo: ResumoCaixa
  movimentos: MovimentoCaixa[]
}

export interface SessaoCaixaLista {
  id: string
  numero: number
  operador_id: string
  operador_nome: string
  terminal: string | null
  aberto_em: string
  fundo_troco: number
  situacao: 'aberto' | 'fechado'
  fechado_em: string | null
  valor_esperado: number | null
  valor_contado: number | null
  diferenca: number | null
  fechamento_forcado: boolean
  total_vendido: number
  quantidade_vendas: number
  vencido: boolean
  minutos_aberto: number
}

export interface ItemVenda {
  id: string
  ordem: number
  produto_id: string
  descricao: string
  codigo_barras: string | null
  unidade: string
  quantidade: number
  preco_unitario: number
  total_bruto: number
  desconto: number
  rateio_desconto: number
  total_liquido: number
  quantidade_devolvida: number
  valor_devolvido: number
  quantidade_disponivel_devolucao: number
  custo_unitario?: number
}

export interface PagamentoVenda {
  id: string
  ordem: number
  forma: Forma
  valor: number
  parcelas: number
  codigo_vale: string | null
  observacao: string | null
}

export interface Venda {
  id: string
  numero: number
  sessao_caixa_id: string
  sessao_numero: number
  sessao_situacao: string
  operador_id: string
  operador_nome: string
  cliente_id: string | null
  cliente_nome: string | null
  cliente_documento: string | null
  documento_recibo: string | null
  terminal: string | null
  soma_bruto: number
  desconto_itens: number
  subtotal: number
  desconto_venda: number
  desconto_total: number
  total: number
  troco: number
  situacao: 'finalizada' | 'cancelada'
  finalizada_em: string
  cancelada_em: string | null
  cancelada_por_nome: string | null
  cancelamento_autorizado_por_nome: string | null
  motivo_cancelamento: string | null
  pode_cancelar: boolean
  itens: ItemVenda[]
  pagamentos: PagamentoVenda[]
  autorizacoes: {
    id: string; tipo: string; percentual: number | null; valor: number | null; motivo: string | null
    data_hora: string; operador_nome: string; autorizador_nome: string
  }[]
  devolucoes: { id: string; numero: number; valor: number; destino: string; forma_estorno: string | null; criado_em: string }[]
}

export interface VendaLista {
  id: string
  numero: number
  finalizada_em: string
  operador_id: string
  operador_nome: string
  cliente_id: string | null
  cliente_nome: string | null
  desconto_total: number
  total: number
  troco: number
  situacao: 'finalizada' | 'cancelada'
  formas: Forma[]
  formas_resumo: string
}

export interface EmpresaRecibo {
  nome_fantasia: string
  razao_social: string | null
  cnpj: string
  telefone: string | null
  whatsapp: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  mensagem_rodape: string | null
  fuso_horario: string
  tem_logo: boolean
  logo_url: string | null
}

export interface Recibo {
  empresa: EmpresaRecibo
  configuracao: { papel_recibo: '58mm' | '80mm' | 'A4'; mostrar_logo_recibo: boolean; imprimir_automaticamente: boolean; vias_recibo: number }
  aviso_nao_fiscal: string
  exemplo: boolean
  segunda_via: boolean
  cancelada: boolean
  venda: Venda & { operador_nome_curto: string; codigo_barras_venda: string }
}

export interface Vale {
  id: string
  codigo: string
  cliente_id: string | null
  cliente_nome: string | null
  valor_original: number
  saldo: number
  validade: string
  situacao: 'ativo' | 'usado' | 'expirado' | 'cancelado'
  utilizavel: boolean
  devolucao_numero: number | null
  venda_origem_numero: number | null
  motivo_cancelamento: string | null
  criado_em: string
}

export interface Devolucao {
  id: string
  numero: number
  venda_id: string
  venda_numero: number
  venda_data: string
  cliente_id: string | null
  cliente_nome: string | null
  valor: number
  destino: 'vale_troca' | 'estorno'
  forma_estorno: Forma | null
  motivo: string
  motivo_texto: string | null
  usuario_nome: string
  autorizador_nome: string | null
  vale_codigo: string | null
  vale_validade: string | null
  vale_saldo: number | null
  criado_em: string
  itens: { id: string; descricao: string; unidade: string; quantidade: number; valor: number; volta_estoque: boolean }[]
}

export interface Dashboard {
  data_referencia: string
  hoje: { total_vendido: number; vendas_brutas: number; devolucoes: number; numero_vendas: number; ticket_medio: number; itens_vendidos: number }
  mes: {
    total_vendido: number; numero_vendas: number; ticket_medio: number; itens_vendidos: number; devolucoes: number
    mes_anterior_mesmo_periodo: { inicio: string; fim: string; total_vendido: number; numero_vendas: number }
    variacao_percentual: number | null
  }
  grafico: { periodo: string; agrupamento: 'dia' | 'mes'; pontos: { data: string; total: number; numero_vendas: number }[] }
  formas_pagamento: { hoje: { forma: Forma; valor: number; percentual: number }[]; mes: { forma: Forma; valor: number; percentual: number }[] }
  mais_vendidos: {
    periodo: string; inicio: string; fim: string
    por_quantidade: { produto_id: string; nome: string; unidade: string; quantidade: number; valor: number }[]
    por_valor: { produto_id: string; nome: string; unidade: string; quantidade: number; valor: number }[]
  }
  estoque_baixo: { itens: EstoqueBaixoItem[]; total: number }
  caixas_abertos: { id: string; numero: number; operador_id: string; operador_nome: string; terminal: string | null; aberto_em: string; minutos_aberto: number; total_vendido: number; quantidade_vendas: number; vencido: boolean }[]
}

export interface EstoqueBaixoItem {
  id: string
  codigo: string
  nome: string
  unidade: string
  estoque_atual: number
  estoque_minimo: number
  preco_custo: number
  fornecedor_id: string | null
  fornecedor_nome: string | null
  categoria_nome: string | null
  sugestao_compra: number
  ultimo_custo: number
  valor_estimado: number
}

export interface PosicaoEstoque {
  id: string
  codigo: string
  codigo_barras: string | null
  nome: string
  unidade: string
  categoria_nome: string | null
  estoque_atual: number
  estoque_minimo: number
  preco_custo: number
  preco_venda: number
  ativo: boolean
  valor_custo: number
  valor_venda: number
  situacao_estoque: 'ok' | 'baixo' | 'zerado' | 'negativo'
}

export interface Movimentacao {
  id: string
  data_hora: string
  produto_id: string
  produto_nome: string
  produto_codigo: string
  unidade: string
  tipo: string
  quantidade: number
  quantidade_com_sinal: number
  saldo_anterior: number
  saldo_posterior: number
  custo_unitario: number | null
  motivo: string | null
  motivo_texto: string | null
  usuario_nome: string
  origem_tipo: string | null
  origem_id: string | null
  origem_numero: number | null
}

export interface EntradaLista {
  id: string
  numero: number
  data_recebimento: string
  fornecedor_id: string | null
  fornecedor_nome: string | null
  numero_nota: string | null
  situacao: 'rascunho' | 'confirmada'
  criado_em: string
  versao: number
  total: number
  quantidade_itens: number
}

export interface Entrada extends EntradaLista {
  atualizar_custo: boolean
  observacoes: string | null
  criado_por_nome: string
  itens: { id: string; produto_id: string; produto_nome: string; produto_codigo: string; unidade: string; quantidade: number; custo_unitario: number; total: number }[]
}

export interface InventarioLista {
  id: string
  numero: number
  descricao: string
  abrangencia: string
  situacao: 'em_contagem' | 'finalizado' | 'cancelado'
  criado_em: string
  finalizado_em: string | null
  criado_por_nome: string
  total_produtos: number
  contados: number
}

export interface Inventario extends InventarioLista {
  nao_contados: string | null
  itens: {
    produto_id: string; codigo: string; codigo_barras: string | null; nome: string; unidade: string; categoria_nome: string | null
    quantidade_contada: number | null; contado: boolean; estoque_sistema: number; diferenca: number | null
  }[]
  resumo: { total_produtos: number; contados: number; nao_contados: number; com_diferenca: number }
}

export interface RelatorioInfo {
  codigo: string
  slug: string
  titulo: string
  usa_periodo: boolean
  filtros: string[]
}

export interface Relatorio {
  codigo: string
  titulo: string
  periodo: { inicio: string; fim: string } | null
  colunas: { chave: string; titulo: string; tipo: string }[]
  linhas: Record<string, unknown>[]
  totais: Record<string, unknown>
}

export interface SessaoLogin {
  id: string
  usuario_id: string
  usuario_nome: string
  perfil: Perfil
  ip: string | null
  navegador: string | null
  criada_em: string
  ultimo_uso: string
  expira_em: string
}

export interface RegistroAuditoria {
  id: string
  data_hora: string
  usuario_nome: string | null
  autorizador_nome: string | null
  entidade: string
  entidade_id: string | null
  acao: string
  antes: Record<string, unknown> | null
  depois: Record<string, unknown> | null
  ip: string | null
}
