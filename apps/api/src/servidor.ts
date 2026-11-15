import { construirApp } from './app.js';
import { config } from './config.js';
import { fecharBanco } from './db/conexao.js';

const app = await construirApp();

const encerrar = async () => {
  await app.close();
  await fecharBanco();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

try {
  await app.listen({ port: config.porta, host: config.host });
} catch (e) {
  app.log.error(e);
  process.exit(1);
}
