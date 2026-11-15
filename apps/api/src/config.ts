import 'dotenv/config';

function texto(nome: string, padrao: string): string {
  const valor = process.env[nome];
  return valor && valor.trim() !== '' ? valor.trim() : padrao;
}

export const config = {
  ambiente: texto('NODE_ENV', 'development'),
  databaseUrl: texto('DATABASE_URL', 'postgres://postgres:nexo@localhost:5432/nexo'),
  porta: Number(texto('PORTA', '3333')),
  host: texto('HOST', '0.0.0.0'),
  segredoSessao: texto('SEGREDO_SESSAO', 'segredo-de-desenvolvimento-nao-usar-em-producao'),
  origensWeb: texto('ORIGEM_WEB', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  cookieSeguro: texto('COOKIE_SEGURO', 'false') === 'true',
  nivelLog: texto('NIVEL_LOG', 'info'),
  nomeCookie: 'nexo_sessao',
};

export const emTeste = config.ambiente === 'test';
