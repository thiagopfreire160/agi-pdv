import { describe, it, expect, beforeEach } from 'vitest';
import { banco, Cliente, criarProduto, criarUsuarioLogado, prepararLoja, abrirCaixa } from './ajudantes.js';

let admin: Cliente;

beforeEach(async () => {
  admin = await prepararLoja();
});

describe('usuários', () => {
  it('não é possível inativar nem rebaixar o último administrador ativo', async () => {
    const eu = (await admin.get('/api/auth/eu')).corpo.usuario;
    // Inativar a si mesmo é proibido, então testamos com um segundo admin que tenta mexer no primeiro após o primeiro ser único.
    const outro = await criarUsuarioLogado('administrador', 'adm2@teste.com');
    const u2 = (await outro.get('/api/auth/eu')).corpo.usuario;
    expect((await admin.post(`/api/usuarios/${u2.id}/inativar`)).status).toBe(200);
    const rebaixar = await outro.put(`/api/usuarios/${eu.id}`, { versao: eu.versao, perfil: 'gerente' });
    expect(rebaixar.status).toBe(401); // o adm2 foi inativado: sessão derrubada
    const reat = await admin.post(`/api/usuarios/${u2.id}/reativar`);
    expect(reat.status).toBe(200);
    // Agora o admin original tenta rebaixar o adm2 depois de inativar... checamos a regra direto:
    await banco().updateTable('usuarios').set({ ativo: false }).where('id', '=', u2.id).execute();
    const atual = (await admin.get(`/api/usuarios/${eu.id}`)).corpo;
    const g = await criarUsuarioLogado('gerente', 'g@teste.com');
    expect((await g.post(`/api/usuarios/${eu.id}/inativar`)).status).toBe(403);
    expect((await admin.put(`/api/usuarios/${eu.id}`, { versao: atual.versao, perfil: 'gerente' })).corpo.erro).toMatch(/próprio perfil/);
    // Com dois admins ativos, um rebaixa o outro; o último restante fica protegido.
    await banco().updateTable('usuarios').set({ ativo: true }).where('id', '=', u2.id).execute();
    const adm2 = new Cliente('10.3.3.3');
    await adm2.entrar('adm2@teste.com');
    expect((await adm2.put(`/api/usuarios/${eu.id}`, { versao: atual.versao, perfil: 'gerente' })).status).toBe(200);
    const ultimo = (await admin.get(`/api/auth/eu`)).corpo;
    expect(ultimo.usuario.perfil).toBe('gerente');
    expect((await admin.post(`/api/usuarios/${u2.id}/inativar`)).status).toBe(403);
  });

  it('o sistema impede inativar o último administrador (por outro usuário)', async () => {
    const eu = (await admin.get('/api/auth/eu')).corpo.usuario;
    const outro = await criarUsuarioLogado('administrador', 'adm2@teste.com');
    const u2 = (await outro.get('/api/auth/eu')).corpo.usuario;
    await banco().updateTable('usuarios').set({ perfil: 'gerente' }).where('id', '=', eu.id).execute();
    // adm2 é agora o único admin; o "eu" (gerente) não pode mexer em admin; adm2 não pode se inativar.
    expect((await outro.post(`/api/usuarios/${u2.id}/inativar`)).status).toBe(422);
    const r = await outro.put(`/api/usuarios/${u2.id}`, { versao: u2.versao, perfil: 'gerente' });
    expect(r.status).toBe(422);
  });

  it('gerente não cria gerente/administrador nem edita administrador (direto na API)', async () => {
    const gerente = await criarUsuarioLogado('gerente', 'ger@teste.com');
    const eu = (await admin.get('/api/auth/eu')).corpo.usuario;
    expect((await gerente.post('/api/usuarios', { nome: 'Novo', email: 'n@t.com', perfil: 'gerente' })).status).toBe(403);
    expect((await gerente.post('/api/usuarios', { nome: 'Novo', email: 'n@t.com', perfil: 'administrador' })).status).toBe(403);
    expect((await gerente.put(`/api/usuarios/${eu.id}`, { versao: eu.versao, nome: 'Hack' })).status).toBe(403);
    expect((await gerente.post(`/api/usuarios/${eu.id}/redefinir-senha`)).status).toBe(403);
    const cx = await gerente.post('/api/usuarios', { nome: 'Novo Caixa', email: 'nc@t.com', perfil: 'caixa', senha: 'Caixa1234' });
    expect(cx.status).toBe(201);
    expect(cx.corpo.senha_temporaria).toBeNull();
    expect((await gerente.put(`/api/usuarios/${cx.corpo.usuario.id}`, { versao: cx.corpo.usuario.versao, perfil: 'gerente' })).status).toBe(403);
  });

  it('e-mail duplicado e CPF inválido são recusados', async () => {
    expect((await admin.post('/api/usuarios', { nome: 'Xavier', email: 'ADMIN@teste.com', perfil: 'caixa' })).status).toBe(409);
    const r = await admin.post('/api/usuarios', { nome: 'Xavier', email: 'x@teste.com', perfil: 'caixa', cpf: '111.111.111-11' });
    expect(r.status).toBe(422);
    expect(r.corpo.campos.cpf).toBeTruthy();
  });

  it('caixa recebe 403 ao criar produto, ver relatórios, configurações e dashboard', async () => {
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    expect((await caixa.post('/api/produtos', { nome: 'X', preco_venda: 100 })).status).toBe(403);
    expect((await caixa.get('/api/relatorios/r1')).status).toBe(403);
    expect((await caixa.put('/api/configuracoes', { versao: 1, limite_desconto_caixa: 50 })).status).toBe(403);
    expect((await caixa.get('/api/dashboard')).status).toBe(403);
    expect((await caixa.get('/api/usuarios')).status).toBe(403);
    expect((await caixa.get('/api/auditoria')).status).toBe(403);
    expect((await caixa.get('/api/empresa')).status).toBe(403);
  });

  it('caixa não recebe preço de custo em nenhuma resposta', async () => {
    const p = await criarProduto(admin, { nome: 'Arroz', preco_venda: 2500, preco_custo: 1800, codigo_barras: '7891000315507', estoque_inicial: 10 });
    expect(p.preco_custo).toBe(1800);
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    await abrirCaixa(caixa);
    const respostas = [
      await caixa.get('/api/produtos'),
      await caixa.get(`/api/produtos/${p.id}`),
      await caixa.get('/api/produtos/busca?q=arr'),
      await caixa.get('/api/produtos/codigo/7891000315507'),
    ];
    const v = await caixa.post('/api/vendas', {
      id: crypto.randomUUID(),
      itens: [{ produto_id: p.id, quantidade: 1, preco_unitario: 2500 }],
      pagamentos: [{ forma: 'pix', valor: 2500 }],
    });
    respostas.push(v, await caixa.get(`/api/vendas/${v.corpo.venda.id}`), await caixa.get(`/api/vendas/${v.corpo.venda.id}/recibo`));
    for (const r of respostas) {
      expect(r.status).toBeLessThan(300);
      expect(r.texto).not.toMatch(/preco_custo|custo_unitario|"margem"/);
    }
  });

  it('inativar usuário derruba as sessões dele imediatamente; com caixa aberto pede fechamento antes', async () => {
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    const id = (await caixa.get('/api/auth/eu')).corpo.usuario.id;
    const sessao = await abrirCaixa(caixa);
    const r = await admin.post(`/api/usuarios/${id}/inativar`);
    expect(r.status).toBe(409);
    expect(r.corpo.codigo).toBe('CAIXA_ABERTO');
    expect((await admin.post(`/api/caixa/sessoes/${sessao.id}/fechar`, { valor_contado: 10000 })).status).toBe(200);
    expect((await admin.post(`/api/usuarios/${id}/inativar`)).status).toBe(200);
    expect((await caixa.get('/api/produtos')).status).toBe(401);
    expect((await new Cliente().post('/api/auth/entrar', { identificador: 'cx@teste.com', senha: 'Senha1234' })).status).toBe(401);
  });

  it('redefinir senha mostra a senha temporária uma única vez e derruba sessões', async () => {
    const caixa = await criarUsuarioLogado('caixa', 'cx@teste.com');
    const id = (await caixa.get('/api/auth/eu')).corpo.usuario.id;
    const r = await admin.post(`/api/usuarios/${id}/redefinir-senha`);
    expect(r.corpo.senha_temporaria).toHaveLength(8);
    expect((await admin.get(`/api/usuarios/${id}`)).texto).not.toContain(r.corpo.senha_temporaria);
    expect((await caixa.get('/api/produtos')).status).toBe(401);
    const novo = new Cliente();
    expect((await novo.post('/api/auth/entrar', { identificador: 'cx@teste.com', senha: r.corpo.senha_temporaria })).corpo.deve_trocar_senha).toBe(true);
  });

  it('edições de usuário, configuração e produto geram auditoria com antes/depois', async () => {
    const p = await criarProduto(admin, { nome: 'Feijão', preco_venda: 800 });
    await admin.put(`/api/produtos/${p.id}`, { versao: p.versao, preco_venda: 900 });
    const cfg = (await admin.get('/api/configuracoes')).corpo;
    await admin.put('/api/configuracoes', { versao: cfg.versao, limite_desconto_caixa: 7 });
    const aud = await admin.get('/api/auditoria?entidade=produto&acao=editar');
    expect(aud.corpo.itens[0].antes).toEqual({ preco_venda: 800 });
    expect(aud.corpo.itens[0].depois).toEqual({ preco_venda: 900 });
    const audCfg = await admin.get('/api/auditoria?entidade=configuracoes');
    expect(audCfg.corpo.itens[0].depois).toEqual({ limite_desconto_caixa: 7 });
    expect(JSON.stringify((await admin.get('/api/auditoria?por_pagina=200')).corpo)).not.toMatch(/senha_hash|\$argon2/);
  });

  it('configurações: limite do gerente menor que o do caixa é recusado', async () => {
    const cfg = (await admin.get('/api/configuracoes')).corpo;
    const r = await admin.put('/api/configuracoes', { versao: cfg.versao, limite_desconto_caixa: 10, limite_desconto_gerente: 8 });
    expect(r.status).toBe(422);
    expect(r.corpo.campos.limite_desconto_gerente).toBeTruthy();
  });
});

describe('minha empresa', () => {
  it('CNPJ inválido é recusado; válido com máscara é salvo sem máscara; gerente só visualiza', async () => {
    const e = (await admin.get('/api/empresa')).corpo;
    expect((await admin.put('/api/empresa', { versao: e.versao, cnpj: '11.222.333/0001-80' })).status).toBe(422);
    const ok = await admin.put('/api/empresa', { versao: e.versao, cnpj: '11.444.777/0001-61', cidade: 'Campinas', uf: 'sp', mensagem_rodape: 'Trocas em 30 dias' });
    expect(ok.status).toBe(200);
    expect(ok.corpo.cnpj).toBe('11444777000161');
    expect(ok.corpo.uf).toBe('SP');
    const g = await criarUsuarioLogado('gerente', 'g@teste.com');
    expect((await g.get('/api/empresa')).status).toBe(200);
    expect((await g.put('/api/empresa', { versao: ok.corpo.versao, nome_fantasia: 'X' })).status).toBe(403);
    expect((await admin.put('/api/empresa', { versao: ok.corpo.versao, cidade: 'Rio', uf: null })).status).toBe(422);
  });

  it('logo: recusa formato diferente de PNG/JPG e acima de 1 MB; aceita PNG e aparece no recibo de teste', async () => {
    expect((await admin.put('/api/empresa/logo', { imagem: Buffer.from('GIF89a....').toString('base64') })).status).toBe(422);
    const grande = Buffer.alloc(1024 * 1024 + 10, 1);
    grande.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect((await admin.put('/api/empresa/logo', { imagem: grande.toString('base64') })).status).toBe(422);
    const sharp = (await import('sharp')).default;
    const png = await sharp({ create: { width: 1200, height: 300, channels: 3, background: '#1f5e3b' } }).png().toBuffer();
    const r = await admin.put('/api/empresa/logo', { imagem: `data:image/png;base64,${png.toString('base64')}` });
    expect(r.status).toBe(200);
    expect(r.corpo.tem_logo).toBe(true);
    const logo = await admin.get('/api/empresa/logo');
    expect(logo.cabecalhos['content-type']).toBe('image/png');
    const meta = await sharp(Buffer.from(logo.texto, 'binary')).metadata().catch(() => null);
    const bytes = await banco().selectFrom('empresa').select('logo').executeTakeFirstOrThrow();
    expect((await sharp(bytes.logo).metadata()).width).toBe(600);
    void meta;
    const e = (await admin.get('/api/empresa')).corpo;
    await admin.put('/api/empresa', { versao: e.versao, mensagem_rodape: 'Volte sempre', logradouro: 'Rua A', numero: 's/n' });
    const recibo = (await admin.get('/api/configuracoes/recibo-teste')).corpo;
    expect(recibo.empresa.nome_fantasia).toBe('Mercadinho Teste');
    expect(recibo.empresa.mensagem_rodape).toBe('Volte sempre');
    expect(recibo.empresa.numero).toBe('S/N');
    expect(recibo.empresa.logo_url).toBe('/api/empresa/logo');
    expect(recibo.aviso_nao_fiscal).toMatch(/NÃO É DOCUMENTO FISCAL/);
  });
});
