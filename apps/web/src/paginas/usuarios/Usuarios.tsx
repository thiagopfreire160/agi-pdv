import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, KeyRound, LogOut, Plus, Search, UserPlus } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Lista, Perfil, SessaoCaixa, Usuario } from '../../api/tipos'
import { useUsuario } from '../../ganchos/useSessao'
import { useAtraso } from '../../ganchos/useAtraso'
import { BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { CampoMascara, CampoTexto, Interruptor, Selecao } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula, type TomPilula } from '../../componentes/ui/Pilula'
import { Gaveta, Modal } from '../../componentes/ui/Modal'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { useAvisos } from '../../componentes/ui/Avisos'
import { ModalFechamento } from '../caixa/ModalFechamento'
import { cpfValido, dataHora, emailValido, iniciais, mascararCpf, NOMES_PERFIL, soDigitos } from '../../utils/formatos'
import { erroSenha } from '../acesso/senha'

const TOM_PERFIL: Record<Perfil, TomPilula> = { administrador: 'info', gerente: 'aviso', caixa: 'neutro' }

function SenhaUmaVez({ senha, nome, aoFechar }: { senha: string | null; nome: string; aoFechar: () => void }) {
  const { sucesso } = useAvisos()
  return (
    <Modal aberto={!!senha} aoFechar={aoFechar} titulo="Senha temporária" descricao={`Passe para ${nome}. Ela aparece só esta vez e será trocada no primeiro acesso.`} largura="sm">
      <div className="flex flex-col items-center gap-4">
        <p className="tabular rounded-2xl bg-superficie-2 px-6 py-4 font-mono text-3xl font-bold tracking-[0.2em] text-texto" data-teste="senha-temporaria">{senha}</p>
        <div className="grid w-full grid-cols-2 gap-2.5">
          <Botao variante="contorno" icone={<Copy size={16} />} onClick={() => { navigator.clipboard?.writeText(senha ?? ''); sucesso('Senha copiada.') }}>
            Copiar
          </Botao>
          <Botao data-primario onClick={aoFechar}>Já anotei</Botao>
        </div>
      </div>
    </Modal>
  )
}

function GavetaUsuario({ alvo, aoFechar }: { alvo: Usuario | 'novo' | null; aoFechar: () => void }) {
  const eu = useUsuario()
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const novo = alvo === 'novo'
  const u = alvo && alvo !== 'novo' ? alvo : null
  const ehGerente = eu.perfil === 'gerente'
  const [f, setF] = useState({ nome: '', email: '', cpf: '', telefone: '', perfil: 'caixa' as Perfil, gerar: true, senha: '' })
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [senha, setSenha] = useState<{ valor: string; nome: string } | null>(null)
  const [fecharCaixa, setFecharCaixa] = useState<SessaoCaixa | null>(null)

  useEffect(() => {
    if (novo) setF({ nome: '', email: '', cpf: '', telefone: '', perfil: 'caixa', gerar: true, senha: '' })
    else if (u) setF({ nome: u.nome, email: u.email, cpf: u.cpf ?? '', telefone: u.telefone ?? '', perfil: u.perfil, gerar: true, senha: '' })
    setErros({})
  }, [alvo]) // eslint-disable-line react-hooks/exhaustive-deps

  const souEu = u?.id === eu.id
  const podeMexer = !ehGerente || (u ? u.perfil === 'caixa' : true)

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['usuarios'] })
  }

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault()
    const er: Record<string, string> = {}
    if (f.nome.trim().length < 2) er.nome = 'Informe o nome.'
    if (!emailValido(f.email)) er.email = 'Informe um e-mail válido. Ele é usado para entrar.'
    if (f.cpf && !cpfValido(f.cpf)) er.cpf = 'Confira o CPF: os dígitos não batem.'
    if (novo && !f.gerar) {
      const s = erroSenha(f.senha)
      if (s) er.senha = s
    }
    setErros(er)
    if (Object.keys(er).length) return
    setSalvando(true)
    try {
      const base = { nome: f.nome.trim(), email: f.email.trim(), cpf: soDigitos(f.cpf) || null, telefone: soDigitos(f.telefone) || null }
      if (novo) {
        const r = await api.post<{ usuario: Usuario; senha_temporaria: string | null }>('/usuarios', { ...base, perfil: f.perfil, ...(f.gerar ? { gerar_senha: true } : { senha: f.senha }) })
        recarregar()
        sucesso(`${r.usuario.nome} foi cadastrado.`)
        if (r.senha_temporaria) setSenha({ valor: r.senha_temporaria, nome: r.usuario.nome })
        else aoFechar()
      } else if (u) {
        await api.put(`/usuarios/${u.id}`, { ...base, ...(souEu ? {} : { perfil: f.perfil }), versao: u.versao })
        recarregar()
        sucesso('Usuário salvo.')
        aoFechar()
      }
    } catch (er2) {
      if (er2 instanceof ErroApi && er2.campos) setErros(er2.campos)
      else erro(mensagemErro(er2))
    } finally {
      setSalvando(false)
    }
  }

  async function redefinir() {
    if (!u) return
    const ok = await confirmar({ titulo: `Gerar nova senha para ${u.nome}?`, mensagem: 'A senha atual deixa de valer e a pessoa é desconectada de todos os computadores.', confirmar: 'Gerar senha temporária' })
    if (ok === null) return
    try {
      const r = await api.post<{ senha_temporaria: string }>(`/usuarios/${u.id}/redefinir-senha`)
      setSenha({ valor: r.senha_temporaria, nome: u.nome })
      recarregar()
    } catch (e) {
      erro(mensagemErro(e))
    }
  }

  async function situacao() {
    if (!u) return
    if (u.ativo) {
      const ok = await confirmar({ titulo: `Inativar ${u.nome}?`, mensagem: 'A pessoa não consegue mais entrar e é desconectada agora. O histórico continua.', confirmar: 'Inativar usuário', perigo: true })
      if (ok === null) return
    }
    try {
      await api.post(`/usuarios/${u.id}/${u.ativo ? 'inativar' : 'reativar'}`)
      sucesso(u.ativo ? 'Usuário inativado.' : 'Usuário reativado.')
      recarregar()
      aoFechar()
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CAIXA_ABERTO' && e.dados.sessao_caixa_id) {
        const ok = await confirmar({ titulo: `${u.nome} está com o caixa aberto`, mensagem: 'Para inativar, feche o caixa dessa pessoa antes. Você informa o dinheiro contado.', confirmar: 'Fechar o caixa agora' })
        if (ok === null) return
        setFecharCaixa(await api.get<SessaoCaixa>(`/caixa/sessoes/${e.dados.sessao_caixa_id}`))
      } else erro(mensagemErro(e))
    }
  }

  async function encerrar() {
    if (!u) return
    try {
      const r = await api.post<{ sessoes_encerradas: number }>(`/usuarios/${u.id}/encerrar-sessoes`)
      sucesso(`${r.sessoes_encerradas} ${r.sessoes_encerradas === 1 ? 'acesso encerrado' : 'acessos encerrados'}.`)
    } catch (e) {
      erro(mensagemErro(e))
    }
  }

  return (
    <>
      <Gaveta
        aberto={!!alvo}
        aoFechar={aoFechar}
        titulo={novo ? 'Novo usuário' : u?.nome ?? ''}
        descricao={novo ? 'A pessoa troca a senha no primeiro acesso.' : u ? `Último acesso: ${u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'nunca'}` : undefined}
        rodape={
          podeMexer && (
            <>
              {u && !souEu && (
                <Botao variante="fantasma" className="mr-auto text-erro-fg" onClick={situacao}>
                  {u.ativo ? 'Inativar' : 'Reativar'}
                </Botao>
              )}
              <Botao carregando={salvando} onClick={() => salvar()}>{novo ? 'Cadastrar usuário' : 'Salvar alterações'}</Botao>
            </>
          )
        }
      >
        <form onSubmit={salvar} className="flex flex-col gap-4">
          {!podeMexer && <p className="rounded-xl bg-info-bg px-4 py-3 text-sm text-info-fg">Gerente só altera usuários com perfil Caixa.</p>}
          <CampoTexto rotulo="Nome" obrigatorio data-autofoco maxLength={80} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} erro={erros.nome} disabled={!podeMexer} />
          <CampoTexto rotulo="E-mail (usado para entrar)" obrigatorio type="email" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} erro={erros.email} disabled={!podeMexer} />
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoMascara rotulo="CPF" tipo="cpf" valor={f.cpf} aoMudar={(v) => setF({ ...f, cpf: v })} erro={erros.cpf} disabled={!podeMexer} ajuda="Também serve para entrar." />
            <CampoMascara rotulo="Telefone" tipo="telefone" valor={f.telefone} aoMudar={(v) => setF({ ...f, telefone: v })} erro={erros.telefone} disabled={!podeMexer} />
          </div>
          <Selecao rotulo="Perfil" value={f.perfil} onChange={(e) => setF({ ...f, perfil: e.target.value as Perfil })} disabled={!podeMexer || souEu || ehGerente} erro={erros.perfil} ajuda={souEu ? 'Você não pode mudar o próprio perfil.' : undefined}>
            <option value="caixa">Caixa: vende e faz sangria e suprimento</option>
            <option value="gerente">Gerente: cadastros, estoque, relatórios e autorizações</option>
            <option value="administrador">Administrador: tudo, inclusive as configurações</option>
          </Selecao>
          {novo && (
            <>
              <Interruptor rotulo="Gerar senha automaticamente" descricao="O sistema mostra a senha uma única vez para você passar." marcado={f.gerar} aoMudar={(v) => setF({ ...f, gerar: v })} />
              {!f.gerar && <CampoTexto rotulo="Senha inicial" type="text" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} erro={erros.senha} ajuda="Pelo menos 8 caracteres, com letras e números." />}
            </>
          )}
          <button type="submit" hidden />
        </form>
        {u && podeMexer && !souEu && (
          <div className="mt-6 flex flex-wrap gap-2.5 border-t border-borda pt-5">
            <Botao variante="contorno" icone={<KeyRound size={16} />} onClick={redefinir}>Gerar nova senha</Botao>
            <Botao variante="contorno" icone={<LogOut size={16} />} onClick={encerrar}>Desconectar de todos os computadores</Botao>
          </div>
        )}
      </Gaveta>
      <SenhaUmaVez senha={senha?.valor ?? null} nome={senha?.nome ?? ''} aoFechar={() => { setSenha(null); aoFechar() }} />
      <ModalFechamento
        aberto={!!fecharCaixa}
        sessao={fecharCaixa}
        forcado
        aoFechar={() => setFecharCaixa(null)}
        aoConcluir={() => { setFecharCaixa(null); sucesso('Caixa fechado. Agora é possível inativar.'); situacao() }}
      />
    </>
  )
}

export function Usuarios() {
  const [busca, setBusca] = useState('')
  const [perfil, setPerfil] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [pagina, setPagina] = useState(1)
  const [alvo, setAlvo] = useState<Usuario | 'novo' | null>(null)
  const atraso = useAtraso(busca)
  useEffect(() => setPagina(1), [atraso, perfil, situacao])
  const q = useQuery({
    queryKey: ['usuarios', atraso, perfil, situacao, pagina],
    queryFn: () => api.get<Lista<Usuario>>('/usuarios', { busca: atraso, perfil, situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<Usuario>[] = [
    {
      chave: 'n',
      titulo: 'Nome',
      render: (u) => (
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-floresta-100 text-xs font-bold text-floresta-700 dark:bg-floresta-800 dark:text-floresta-100">{iniciais(u.nome)}</span>
          <span>
            <span className="block font-semibold text-texto">{u.nome}</span>
            <span className="text-xs text-texto-3">{u.email}</span>
          </span>
        </span>
      ),
    },
    { chave: 'cpf', titulo: 'CPF', render: (u) => <span className="tabular">{u.cpf ? mascararCpf(u.cpf) : '—'}</span>, ocultarCelular: true },
    { chave: 'p', titulo: 'Perfil', render: (u) => <Pilula tom={TOM_PERFIL[u.perfil]}>{NOMES_PERFIL[u.perfil]}</Pilula> },
    { chave: 'a', titulo: 'Último acesso', render: (u) => <span className="tabular">{u.ultimo_acesso ? dataHora(u.ultimo_acesso) : 'Nunca'}</span>, ocultarCelular: true },
    {
      chave: 's',
      titulo: 'Situação',
      alinhar: 'direita',
      render: (u) => (
        <span className="inline-flex gap-1.5">
          {u.deve_trocar_senha && u.ativo && <Pilula tom="aviso">Troca de senha</Pilula>}
          {u.ativo ? <Pilula tom="ok">Ativo</Pilula> : <Pilula tom="neutro">Inativo</Pilula>}
        </span>
      ),
    },
  ]
  return (
    <div>
      <CabecalhoPagina titulo="Usuários" descricao="Quem acessa o sistema e o que cada um pode fazer." acoes={<Botao icone={<Plus size={18} />} onClick={() => setAlvo('novo')}>Novo usuário</Botao>} />
      <Card>
        <BarraFiltros>
          <CampoTexto className="w-full sm:w-72" rotulo="Buscar" icone={<Search size={16} />} placeholder="Nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <Selecao className="w-40" rotulo="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value)}>
            <option value="">Todos</option>
            <option value="administrador">Administrador</option>
            <option value="gerente">Gerente</option>
            <option value="caixa">Caixa</option>
          </Selecao>
          <Selecao className="w-36" rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </Selecao>
        </BarraFiltros>
        <Tabela
          colunas={colunas}
          linhas={q.data?.itens}
          carregando={q.isFetching}
          chaveLinha={(u) => u.id}
          aoClicarLinha={setAlvo}
          vazio={{ titulo: 'Nenhum usuário encontrado', acao: <Botao icone={<UserPlus size={16} />} onClick={() => setAlvo('novo')}>Novo usuário</Botao> }}
        />
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
      </Card>
      <GavetaUsuario alvo={alvo} aoFechar={() => setAlvo(null)} />
    </div>
  )
}
