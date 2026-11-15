import { banco, sql, type Tx } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { erroConflitoVersao, erroValidacao } from '../../lib/erros.js';

export interface Configuracoes {
  limite_desconto_caixa: number;
  limite_desconto_gerente: number;
  limite_desconto_administrador: number;
  exigir_autorizacao_remover_item: boolean;
  permitir_vender_sem_estoque: boolean;
  max_parcelas_credito: number;
  validade_vale_troca_dias: number;
  prazo_trocas_dias: number;
  alerta_sangria_valor: number;
  papel_recibo: '58mm' | '80mm' | 'A4';
  mostrar_logo_recibo: boolean;
  imprimir_automaticamente: boolean;
  vias_recibo: number;
  duracao_sessao_horas: number;
  inatividade_minutos: number;
  tentativas_login: number;
  tempo_bloqueio_minutos: number;
  versao: number;
  atualizado_em?: Date;
}

const PADRAO: Omit<Configuracoes, 'versao'> = {
  limite_desconto_caixa: 5,
  limite_desconto_gerente: 20,
  limite_desconto_administrador: 100,
  exigir_autorizacao_remover_item: true,
  permitir_vender_sem_estoque: false,
  max_parcelas_credito: 12,
  validade_vale_troca_dias: 90,
  prazo_trocas_dias: 30,
  alerta_sangria_valor: 0,
  papel_recibo: '80mm',
  mostrar_logo_recibo: true,
  imprimir_automaticamente: false,
  vias_recibo: 1,
  duracao_sessao_horas: 12,
  inatividade_minutos: 0,
  tentativas_login: 5,
  tempo_bloqueio_minutos: 10,
};

export async function garantirConfiguracoes(db: Tx) {
  await sql`INSERT INTO configuracoes (unico) VALUES (true) ON CONFLICT (unico) DO NOTHING`.execute(db);
}

export async function obterConfiguracoes(db: Tx = banco()): Promise<Configuracoes> {
  const r = await db.selectFrom('configuracoes').selectAll().executeTakeFirst();
  if (!r) return { ...PADRAO, versao: 0 };
  const { id: _id, unico: _u, atualizado_por: _ap, ...resto } = r;
  return { ...resto, limite_desconto_administrador: 100 } as Configuracoes;
}

export function limiteDoPerfil(cfg: Configuracoes, perfil: string): number {
  if (perfil === 'administrador') return 100;
  if (perfil === 'gerente') return cfg.limite_desconto_gerente;
  return cfg.limite_desconto_caixa;
}

export async function atualizarConfiguracoes(dados: Partial<Configuracoes> & { versao: number }, ator: Ator) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      await garantirConfiguracoes(tx);
      const atual = await tx.selectFrom('configuracoes').selectAll().forUpdate().executeTakeFirstOrThrow();
      if (atual.versao !== dados.versao) throw erroConflitoVersao();
      const { versao: _v, limite_desconto_administrador: _l, ...novos } = dados;
      const caixa = novos.limite_desconto_caixa ?? Number(atual.limite_desconto_caixa);
      const gerente = novos.limite_desconto_gerente ?? Number(atual.limite_desconto_gerente);
      if (gerente < caixa) {
        throw erroValidacao('O limite de desconto do Gerente não pode ser menor que o do Caixa.', {
          limite_desconto_gerente: 'Deve ser maior ou igual ao limite do Caixa.',
        });
      }
      const depois = await tx
        .updateTable('configuracoes')
        .set({ ...novos, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .returningAll()
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'configuracoes', entidadeId: atual.id, acao: 'editar', antes: atual, depois });
      return obterConfiguracoes(tx);
    });
}
