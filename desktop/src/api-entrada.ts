// Ponto de entrada da API para o app de desktop.
// É carregado só depois que o main.ts define as variáveis de ambiente (banco, porta, segredos).
export { construirApp } from '../../apps/api/src/app.js';
export { migrarBanco } from '../../apps/api/src/db/migrar.js';
export { criarBanco, fecharBanco } from '../../apps/api/src/db/conexao.js';
export { gerarBackup, restaurarBackup } from '../../apps/api/src/db/copia.js';
