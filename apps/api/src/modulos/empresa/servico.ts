import sharp from 'sharp';
import { banco, sql } from '../../db/conexao.js';
import { auditar, type Ator } from '../../lib/auditoria.js';
import { erroConflitoVersao, erroValidacao, naoEncontrado } from '../../lib/erros.js';

const CAMPOS = [
  'id', 'nome_fantasia', 'razao_social', 'cnpj', 'inscricao_estadual', 'telefone', 'whatsapp', 'email', 'site',
  'cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf', 'mensagem_rodape', 'fuso_horario',
  'logo_tipo', 'versao', 'atualizado_em',
] as const;

export function formatarEmpresa(e: Record<string, any>): Record<string, any> {
  const { logo_tipo, ...resto } = e;
  return { ...resto, tem_logo: !!logo_tipo };
}

export async function obterEmpresa() {
  const e = await banco().selectFrom('empresa').select([...CAMPOS]).executeTakeFirst();
  if (!e) throw naoEncontrado('Empresa ainda não cadastrada. Conclua o primeiro acesso.');
  return formatarEmpresa(e);
}

export async function atualizarEmpresa(ator: Ator, dados: Record<string, unknown> & { versao: number }) {
  return banco()
    .transaction()
    .execute(async (tx) => {
      const antes = await tx.selectFrom('empresa').select([...CAMPOS]).forUpdate().executeTakeFirstOrThrow();
      if (antes.versao !== dados.versao) throw erroConflitoVersao();
      const { versao: _v, ...campos } = dados;
      const depois = await tx
        .updateTable('empresa')
        .set({ ...campos, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
        .returning([...CAMPOS])
        .executeTakeFirstOrThrow();
      await auditar(tx, ator, { entidade: 'empresa', entidadeId: antes.id, acao: 'editar', antes, depois });
      return formatarEmpresa(depois);
    });
}

const LIMITE_LOGO = 1024 * 1024;

/** Recebe a imagem em base64 (pode vir como data URL), valida e guarda redimensionada (máx. 600 px). */
export async function salvarLogo(ator: Ator, imagemBase64: string) {
  const base64 = imagemBase64.replace(/^data:[^;]+;base64,/, '');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) throw erroValidacao('Não foi possível ler a logo. Envie um arquivo PNG ou JPG.', { imagem: 'Envie um PNG ou JPG.' });
  if (bytes.length > LIMITE_LOGO) throw erroValidacao('A logo deve ter no máximo 1 MB. Reduza a imagem e tente de novo.', { imagem: 'Máximo 1 MB.' });
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!png && !jpg) throw erroValidacao('Formato de logo não aceito. Use PNG ou JPG.', { imagem: 'Use PNG ou JPG.' });
  let saida: Buffer;
  try {
    const img = sharp(bytes).resize({ width: 600, withoutEnlargement: true });
    saida = png ? await img.png().toBuffer() : await img.jpeg({ quality: 90 }).toBuffer();
  } catch {
    throw erroValidacao('Não foi possível ler a imagem. Tente outro arquivo PNG ou JPG.', { imagem: 'Imagem inválida.' });
  }
  const tipo = png ? 'image/png' : 'image/jpeg';
  const e = await banco()
    .updateTable('empresa')
    .set({ logo: saida, logo_tipo: tipo, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  await auditar(banco(), ator, { entidade: 'empresa', entidadeId: e.id, acao: 'alterar_logo', depois: { logo_tipo: tipo, bytes: saida.length }, soDiferencas: false });
  return obterEmpresa();
}

export async function removerLogo(ator: Ator) {
  const e = await banco()
    .updateTable('empresa')
    .set({ logo: null, logo_tipo: null, versao: sql`versao + 1`, atualizado_em: sql`now()`, atualizado_por: ator.usuarioId })
    .returning(['id'])
    .executeTakeFirstOrThrow();
  await auditar(banco(), ator, { entidade: 'empresa', entidadeId: e.id, acao: 'remover_logo' });
  return obterEmpresa();
}

export async function lerLogo() {
  const e = await banco().selectFrom('empresa').select(['logo', 'logo_tipo']).executeTakeFirst();
  if (!e?.logo) throw naoEncontrado('A empresa não tem logo cadastrada.');
  return { bytes: e.logo as Buffer, tipo: e.logo_tipo as string };
}
