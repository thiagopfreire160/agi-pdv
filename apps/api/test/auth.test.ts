import { describe, it, expect, beforeEach } from 'vitest';
import { banco, Cliente, CNPJ_VALIDO, criarUsuarioLogado, prepararLoja, SENHA } from './ajudantes.js';
import { limparBanco } from '../src/db/limpar.js';
import { zerarLimitesIp } from '../src/lib/bloqueio.js';

describe('primeiro acesso', () => {
  beforeEach(async () => {
    await limparBanco(banco());
    zerarLimitesIp();
  });

  it('com banco vazio, rotas pedem o primeiro acesso; depois ele não pode ser refeito', async () => {
    const c = new Cliente();
    expect((await c.get('/api/primeiro-acesso')).corpo).toEqual({ necessario: true });
    const r = await c.post('/api/auth/entrar', { identificador: 'x@x.com', senha: 'x' });
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('PRIMEIRO_ACESSO_PENDENTE');
    const ok = await c.post('/api/primeiro-acesso', {
      empresa: { nome_fantasia: 'Loja', cnpj: '11.222.333/0001-81' },
      administrador: { nome: 'Dono', email: 'Dono@Loja.com', senha: SENHA, confirmacao_senha: SENHA },
    });
    expect(ok.status).toBe(201);
    expect((await c.get('/api/auth/eu')).corpo.usuario.perfil).toBe('administrador');
    expect((await c.get('/api/primeiro-acesso')).corpo).toEqual({ necessario: false });
    const de_novo = await c.post('/api/primeiro-acesso', {
      empresa: { nome_fantasia: 'Outra', cnpj: CNPJ_VALIDO },
      administrador: { nome: 'Outro', email: 'o@o.com', senha: SENHA, confirmacao_senha: SENHA },
    });
    expect(de_novo.status).toBe(409);
  });

  it('recusa CNPJ com dígito verificador inválido', async () => {
    const r = await new Cliente().post('/api/primeiro-acesso', {
      empresa: { nome_fantasia: 'Loja', cnpj: '11.222.333/0001-82' },
      administrador: { nome: 'Dono', email: 'd@l.com', senha: SENHA, confirmacao_senha: SENHA },
    });
    expect(r.status).toBe(422);
    expect(r.corpo.campos['empresa.cnpj']).toBeTruthy();
    expect(r.corpo.erro).toBeTruthy();
  });
});

describe('login e sessão', () => {
  beforeEach(async () => {
    await prepararLoja();
  });

  it('e-mail em maiúsculas funciona; cookie é HttpOnly e SameSite=Lax', async () => {
    const c = new Cliente();
    const r = await c.post('/api/auth/entrar', { identificador: 'ADMIN@TESTE.COM', senha: SENHA });
    expect(r.status).toBe(200);
    const cookie = String(r.cabecalhos['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(r.corpo.usuario.senha_hash).toBeUndefined();
    expect(r.corpo.tela_inicial).toBe('dashboard');
  });

  it('login por CPF com e sem máscara', async () => {
    await criarUsuarioLogado('caixa', 'cx@teste.com', { cpf: '52998224725' });
    for (const cpf of ['529.982.247-25', '52998224725']) {
      const r = await new Cliente().post('/api/auth/entrar', { identificador: cpf, senha: SENHA });
      expect(r.status).toBe(200);
      expect(r.corpo.tela_inicial).toBe('caixa');
    }
  });

  it('credencial errada e usuário inexistente: mesma mensagem e mesmo código', async () => {
    const a = await new Cliente().post('/api/auth/entrar', { identificador: 'admin@teste.com', senha: 'errada123' });
    const b = await new Cliente().post('/api/auth/entrar', { identificador: 'ninguem@teste.com', senha: 'errada123' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.corpo).toEqual(b.corpo);
  });

  it('após 5 falhas em 15 min (e-mail+IP), a 6ª tentativa é recusada mesmo com a senha correta', async () => {
    const c = new Cliente('10.9.9.9');
    for (let i = 0; i < 5; i++) expect((await c.post('/api/auth/entrar', { identificador: 'admin@teste.com', senha: 'errada123' })).status).toBe(401);
    const r = await c.post('/api/auth/entrar', { identificador: 'admin@teste.com', senha: SENHA });
    expect(r.status).toBe(429);
    expect(r.corpo.codigo).toBe('BLOQUEADO');
    expect(r.corpo.erro).toMatch(/10 minutos/);
    // Outro IP não é afetado.
    expect((await new Cliente('10.9.9.8').post('/api/auth/entrar', { identificador: 'admin@teste.com', senha: SENHA })).status).toBe(200);
    // O contador está no banco (sobrevive a reinício).
    const t = await banco().selectFrom('tentativas_login').selectAll().execute();
    expect(t.some((x) => x.bloqueado_ate)).toBe(true);
  });

  it('o banco não guarda senhas em texto puro', async () => {
    const u = await banco().selectFrom('usuarios').select('senha_hash').executeTakeFirstOrThrow();
    expect(u.senha_hash).not.toContain(SENHA);
    expect(u.senha_hash).toMatch(/^\$argon2id\$/);
  });

  it('requisição que altera dados sem o cabeçalho anti-CSRF é recusada', async () => {
    const a = new Cliente();
    await a.entrar('admin@teste.com');
    const r = await a.req('POST', '/api/categorias', { nome: 'X' }, { 'x-nexo-csrf': '0' });
    expect(r.status).toBe(403);
    const r2 = await a.req('POST', '/api/categorias', { nome: 'X' }, { origin: 'http://malicioso.com' });
    expect(r2.status).toBe(403);
  });

  it('sem sessão: 401; logout encerra a sessão no servidor', async () => {
    const c = new Cliente();
    expect((await c.get('/api/produtos')).status).toBe(401);
    await c.entrar('admin@teste.com');
    const cookie = c.cookie;
    expect((await c.post('/api/auth/sair')).status).toBe(200);
    c.cookie = cookie;
    const r = await c.get('/api/produtos');
    expect(r.status).toBe(401);
    expect(r.corpo.codigo).toBe('SESSAO_EXPIRADA');
  });

  it('usuário com "deve trocar senha" não acessa nada até trocar; trocar encerra as outras sessões', async () => {
    const admin = new Cliente();
    await admin.entrar('admin@teste.com');
    const criado = await admin.post('/api/usuarios', { nome: 'Carla Caixa', email: 'carla@teste.com', perfil: 'caixa', gerar_senha: true });
    expect(criado.status).toBe(201);
    const temporaria = criado.corpo.senha_temporaria;
    expect(temporaria).toMatch(/^[A-Za-z2-9]{8}$/);

    const pc1 = new Cliente('10.1.1.1');
    const pc2 = new Cliente('10.1.1.2');
    expect((await pc1.post('/api/auth/entrar', { identificador: 'carla@teste.com', senha: temporaria })).corpo.tela_inicial).toBe('trocar_senha');
    await pc2.post('/api/auth/entrar', { identificador: 'carla@teste.com', senha: temporaria });
    const bloqueado = await pc1.get('/api/produtos');
    expect(bloqueado.status).toBe(403);
    expect(bloqueado.corpo.codigo).toBe('TROCA_SENHA_OBRIGATORIA');

    const igual = await pc1.post('/api/auth/senha', { nova_senha: temporaria + '9', confirmacao_senha: 'outra' });
    expect(igual.status).toBe(422);
    const ok = await pc1.post('/api/auth/senha', { nova_senha: 'NovaSenha1', confirmacao_senha: 'NovaSenha1' });
    expect(ok.status).toBe(200);
    expect(ok.corpo.outras_sessoes_encerradas).toBe(1);
    expect((await pc1.get('/api/produtos')).status).toBe(200);
    expect((await pc2.get('/api/produtos')).status).toBe(401);
  });

  it('senha nova igual à atual é recusada', async () => {
    const c = new Cliente();
    await c.entrar('admin@teste.com');
    const r = await c.post('/api/auth/senha', { senha_atual: SENHA, nova_senha: SENHA, confirmacao_senha: SENHA });
    expect(r.status).toBe(422);
    expect(r.corpo.erro).toMatch(/diferente/);
  });

  it('administrador vê e encerra sessões ativas; o usuário cai na próxima ação', async () => {
    const admin = new Cliente();
    await admin.entrar('admin@teste.com');
    const gerente = await criarUsuarioLogado('gerente', 'ger@teste.com');
    const s = await admin.get('/api/sessoes');
    const sessaoGerente = s.corpo.itens.find((x: any) => x.usuario_nome.includes('ger'));
    expect(sessaoGerente.ip).toBeTruthy();
    expect((await admin.del(`/api/sessoes/${sessaoGerente.id}`)).status).toBe(200);
    expect((await gerente.get('/api/produtos')).status).toBe(401);
    expect((await gerente.get('/api/sessoes')).status).toBe(401);
  });

  it('tema escolhido persiste no perfil (vale em qualquer computador)', async () => {
    const a = new Cliente('10.2.2.2');
    await a.entrar('admin@teste.com');
    expect((await a.put('/api/auth/perfil', { tema: 'escuro' })).corpo.tema).toBe('escuro');
    const b = new Cliente('10.2.2.3');
    expect((await b.entrar('admin@teste.com')).corpo.usuario.tema).toBe('escuro');
  });
});
