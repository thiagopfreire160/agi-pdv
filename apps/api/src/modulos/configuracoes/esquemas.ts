import { z, versao } from '../../lib/esquemas.js';

const pct = z.number().min(0, 'Use um valor de 0 a 100.').max(100, 'Use um valor de 0 a 100.')
  .refine((v) => Math.round(v * 100) === v * 100, 'Use no máximo 2 casas decimais.');

export const esquemaConfiguracoes = z.object({
  versao,
  limite_desconto_caixa: pct.optional(),
  limite_desconto_gerente: pct.optional(),
  exigir_autorizacao_remover_item: z.boolean().optional(),
  permitir_vender_sem_estoque: z.boolean().optional(),
  max_parcelas_credito: z.number().int().min(1, 'Use de 1 a 24.').max(24, 'Use de 1 a 24.').optional(),
  validade_vale_troca_dias: z.number().int().min(1, 'Use de 1 a 730 dias.').max(730, 'Use de 1 a 730 dias.').optional(),
  prazo_trocas_dias: z.number().int().min(0, 'Use 0 (sem limite) ou mais dias.').max(3650).optional(),
  alerta_sangria_valor: z.number().int().min(0, 'Use 0 para desligar.').optional(),
  papel_recibo: z.enum(['58mm', '80mm', 'A4']).optional(),
  mostrar_logo_recibo: z.boolean().optional(),
  imprimir_automaticamente: z.boolean().optional(),
  vias_recibo: z.number().int().min(1, 'Use 1 ou 2 vias.').max(2, 'Use 1 ou 2 vias.').optional(),
  duracao_sessao_horas: z.number().int().min(1, 'Use de 1 a 24 horas.').max(24, 'Use de 1 a 24 horas.').optional(),
  inatividade_minutos: z
    .number()
    .int()
    .refine((v) => v === 0 || (v >= 5 && v <= 240), 'Use 0 (desligado) ou de 5 a 240 minutos.')
    .optional(),
  tentativas_login: z.number().int().min(3, 'Use de 3 a 10 tentativas.').max(10, 'Use de 3 a 10 tentativas.').optional(),
  tempo_bloqueio_minutos: z.number().int().min(5, 'Use de 5 a 60 minutos.').max(60, 'Use de 5 a 60 minutos.').optional(),
});
