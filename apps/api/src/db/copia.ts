// Cópia de segurança e restauração do banco sem depender de pg_dump.
// Usa o COPY do próprio PostgreSQL, tabela por tabela, num arquivo .gz.
//
// Formato (dentro do gzip):
//   NEXO-BACKUP 1\n
//   {json com data, migrações e colunas de cada tabela}\n
//   para cada tabela: "@@TABELA <nome> <bytes>\n" seguido dos bytes do COPY em texto
import pg from 'pg';
import { to as copiarPara, from as copiarDe } from 'pg-copy-streams';
import { pipeline } from 'node:stream/promises';
import { Writable, Readable } from 'node:stream';
import { criarBanco } from './conexao.js';
import { migrarBanco } from './migrar.js';

type Meta = { versao: 1; criado_em: string; migracoes: string[]; tabelas: { nome: string; colunas: string[] }[] };

const nomeSeguro = (n: string) => '"' + n.replace(/"/g, '""') + '"';

async function lerTabelas(c: pg.Client) {
  const r = await c.query<{ tabela: string; colunas: string[] }>(`
    select c.table_name as tabela, array_agg(c.column_name::text order by c.ordinal_position) as colunas
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    group by c.table_name order by c.table_name`);
  return r.rows.map((x) => ({ nome: x.tabela, colunas: x.colunas }));
}

/** Escreve o backup (ainda sem compressão) em `saida`. */
export async function gerarBackup(url: string, saida: Writable): Promise<{ tabelas: number; bytes: number }> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  let total = 0;
  const escrever = (b: Buffer | string) =>
    new Promise<void>((ok, erro) => saida.write(b, (e) => (e ? erro(e) : ok())));
  try {
    await c.query('begin isolation level repeatable read read only');
    const tabelas = await lerTabelas(c);
    const migracoes = tabelas.some((t) => t.nome === 'migracoes')
      ? (await c.query<{ name: string }>('select name from migracoes order by name')).rows.map((r) => r.name)
      : [];
    const meta: Meta = { versao: 1, criado_em: new Date().toISOString(), migracoes, tabelas };
    await escrever(`NEXO-BACKUP 1\n${JSON.stringify(meta)}\n`);
    for (const t of tabelas) {
      const partes: Buffer[] = [];
      const colunas = t.colunas.map(nomeSeguro).join(', ');
      await pipeline(
        c.query(copiarPara(`copy ${nomeSeguro(t.nome)} (${colunas}) to stdout`)),
        new Writable({ write(ch, _e, cb) { partes.push(ch as Buffer); cb(); } }),
      );
      const dados = Buffer.concat(partes);
      total += dados.length;
      await escrever(`@@TABELA ${t.nome} ${dados.length}\n`);
      await escrever(dados);
    }
    await c.query('commit');
    return { tabelas: tabelas.length, bytes: total };
  } finally {
    await c.end();
  }
}

/** Substitui todos os dados do banco pelos do backup (conteúdo já descomprimido). */
export async function restaurarBackup(url: string, conteudo: Buffer): Promise<{ tabelas: number }> {
  let pos = 0;
  const linha = () => {
    const fim = conteudo.indexOf(0x0a, pos);
    if (fim < 0) throw new Error('Arquivo de backup incompleto.');
    const s = conteudo.subarray(pos, fim).toString('utf8');
    pos = fim + 1;
    return s;
  };
  if (linha() !== 'NEXO-BACKUP 1') throw new Error('Este arquivo não é um backup do NEXO.');
  const meta = JSON.parse(linha()) as Meta;
  const partes: { nome: string; dados: Buffer }[] = [];
  while (pos < conteudo.length) {
    const m = /^@@TABELA (\S+) (\d+)$/.exec(linha());
    if (!m) throw new Error('Arquivo de backup corrompido.');
    const n = Number(m[2]);
    partes.push({ nome: m[1], dados: conteudo.subarray(pos, pos + n) });
    pos += n;
  }

  // 1. Recria a estrutura do zero com as migrações do sistema.
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('drop schema if exists public cascade; create schema public;');
  } finally {
    await c.end();
  }
  const db = criarBanco(url);
  try {
    await migrarBanco(db);
  } finally {
    await db.destroy();
  }

  // 2. Carrega os dados sem disparar gatilhos nem checar chaves estrangeiras durante a carga.
  const c2 = new pg.Client({ connectionString: url });
  await c2.connect();
  try {
    await c2.query('begin');
    await c2.query('set local session_replication_role = replica');
    const existentes = new Set((await lerTabelas(c2)).map((t) => t.nome));
    // Esvazia todas de uma vez: um truncate por tabela, com cascade, apagaria tabelas já carregadas.
    if (existentes.size) await c2.query(`truncate ${[...existentes].map(nomeSeguro).join(', ')}`);
    for (const p of partes) {
      if (!existentes.has(p.nome)) continue;
      const colunas = meta.tabelas.find((t) => t.nome === p.nome)!.colunas.map(nomeSeguro).join(', ');
      await pipeline(Readable.from([p.dados]), c2.query(copiarDe(`copy ${nomeSeguro(p.nome)} (${colunas}) from stdin`)));
    }
    // 3. Ajusta os contadores automáticos para continuar depois do maior valor restaurado.
    const seqs = await c2.query<{ tabela: string; coluna: string; seq: string }>(`
      select t.relname as tabela, a.attname as coluna, s.relname as seq
      from pg_class s
      join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = s.relnamespace
      where s.relkind = 'S' and n.nspname = 'public'`);
    for (const s of seqs.rows) {
      await c2.query(
        `select setval('public.${nomeSeguro(s.seq)}', coalesce((select max(${nomeSeguro(s.coluna)}) from ${nomeSeguro(s.tabela)}), 1), (select max(${nomeSeguro(s.coluna)}) from ${nomeSeguro(s.tabela)}) is not null)`,
      );
    }
    await c2.query('commit');
  } catch (e) {
    await c2.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c2.end();
  }
  return { tabelas: partes.length };
}
