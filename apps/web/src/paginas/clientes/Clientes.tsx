import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, Search, UserPlus } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Cliente, Lista } from '../../api/tipos'
import { useUsuario } from '../../ganchos/useSessao'
import { useAtraso } from '../../ganchos/useAtraso'
import { pode } from '../../utils/permissoes'
import { BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { AreaTexto, CampoMascara, CampoTexto, Selecao } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { Gaveta } from '../../componentes/ui/Modal'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { CamposEndereco, enderecoDe, enderecoParaApi, enderecoVazio, type Endereco } from '../../componentes/ui/CamposEndereco'
import { useAvisos } from '../../componentes/ui/Avisos'
import { data, dataBrParaIso, dataHora, dinheiro, emailValido, erroDocumento, hojeIso, mascararDocumento, mascararTelefone, soDigitos } from '../../utils/formatos'

interface Form {
  nome: string
  documento: string
  celular: string
  telefone: string
  email: string
  nascimento: string
  observacoes: string
  endereco: Endereco
}

const formVazio: Form = { nome: '', documento: '', celular: '', telefone: '', email: '', nascimento: '', observacoes: '', endereco: enderecoVazio }

function GavetaCliente({ id, novo, aoFechar }: { id: string | null; novo: boolean; aoFechar: () => void }) {
  const usuario = useUsuario()
  const editar = pode.editarCadastros(usuario.perfil) || novo
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const ficha = useQuery({ queryKey: ['cliente', id], queryFn: () => api.get<Cliente>(`/clientes/${id}`), enabled: !!id })
  const c = ficha.data
  const [f, setF] = useState<Form>(formVazio)
  const [inicial, setInicial] = useState<Form>(formVazio)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [verEndereco, setVerEndereco] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const aberto = novo || !!id

  useEffect(() => {
    if (novo) { setF(formVazio); setInicial(formVazio); setErros({}); setVerEndereco(false) }
  }, [novo])
  useEffect(() => {
    if (c && id) {
      const base: Form = {
        nome: c.nome, documento: c.documento ?? '', celular: c.celular ?? '', telefone: c.telefone ?? '', email: c.email ?? '',
        nascimento: c.data_nascimento ? data(c.data_nascimento) : '', observacoes: c.observacoes ?? '', endereco: enderecoDe(c),
      }
      setF(base); setInicial(base); setErros({}); setVerEndereco(!!c.cep || !!c.logradouro)
    }
  }, [c, id])

  const somenteCaixa = usuario.perfil === 'caixa'

  async function fechar() {
    if (JSON.stringify(f) !== JSON.stringify(inicial) && editar) {
      const ok = await confirmar({ titulo: 'Sair sem salvar?', mensagem: 'As alterações serão perdidas.', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando' })
      if (ok === null) return
    }
    aoFechar()
  }

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault()
    const er: Record<string, string> = {}
    if (f.nome.trim().length < 2) er.nome = 'Informe o nome do cliente.'
    const d = erroDocumento(f.documento)
    if (d) er.documento = d
    if (f.email && !emailValido(f.email)) er.email = 'Confira o e-mail. Ex.: nome@email.com'
    let nasc: string | null = null
    if (f.nascimento) {
      nasc = dataBrParaIso(f.nascimento)
      if (!nasc) er.data_nascimento = 'Use o formato dd/mm/aaaa.'
      else if (nasc > hojeIso()) er.data_nascimento = 'A data de nascimento não pode ser no futuro.'
    }
    setErros(er)
    if (Object.keys(er).length) return
    const corpo = somenteCaixa
      ? { nome: f.nome.trim(), documento: soDigitos(f.documento) || null, celular: soDigitos(f.celular) || null }
      : {
          nome: f.nome.trim(), documento: soDigitos(f.documento) || null, celular: soDigitos(f.celular) || null, telefone: soDigitos(f.telefone) || null,
          email: f.email.trim() || null, data_nascimento: nasc, observacoes: f.observacoes.trim() || null, ...enderecoParaApi(f.endereco),
        }
    setSalvando(true)
    try {
      if (c && id) await api.put(`/clientes/${c.id}`, { ...corpo, versao: c.versao })
      else await api.post('/clientes', corpo)
      sucesso('Cliente salvo.')
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['cliente', id] })
      aoFechar()
    } catch (er2) {
      if (er2 instanceof ErroApi && er2.campos) {
        const ex = er2.dados.cliente_existente as { nome?: string } | undefined
        setErros({ ...er2.campos, ...(ex?.nome ? { documento: `Já cadastrado para ${ex.nome}.` } : {}) })
      } else if (er2 instanceof ErroApi && er2.codigo === 'CONFLITO_VERSAO') erro('Outra pessoa salvou este cliente antes. Feche e abra de novo.')
      else erro(mensagemErro(er2))
    } finally {
      setSalvando(false)
    }
  }

  async function situacao() {
    if (!c) return
    if (c.ativo) {
      const ok = await confirmar({ titulo: `Inativar ${c.nome}?`, mensagem: 'O cliente não poderá ser escolhido em novas vendas. Dá para reativar depois.', confirmar: 'Inativar cliente' })
      if (ok === null) return
    }
    try {
      await api.post(`/clientes/${c.id}/${c.ativo ? 'inativar' : 'reativar'}`)
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['cliente', id] })
      sucesso(c.ativo ? 'Cliente inativado.' : 'Cliente reativado.')
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  const podeEditar = novo || pode.editarCadastros(usuario.perfil)

  return (
    <Gaveta
      aberto={aberto}
      aoFechar={fechar}
      largura="max-w-2xl"
      titulo={novo ? 'Novo cliente' : c?.nome ?? 'Cliente'}
      descricao={novo ? 'Só o nome é obrigatório.' : c?.documento ? mascararDocumento(c.documento) : undefined}
      rodape={
        podeEditar && (
          <>
            {c && !novo && pode.editarCadastros(usuario.perfil) && (
              <Botao variante="contorno" className="mr-auto" onClick={situacao}>
                {c.ativo ? 'Inativar' : 'Reativar'}
              </Botao>
            )}
            <Botao carregando={salvando} onClick={() => salvar()}>Salvar cliente</Botao>
          </>
        )
      }
    >
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {c && !c.ativo && <Pilula tom="neutro">Cliente inativo</Pilula>}
        <CampoTexto rotulo="Nome ou razão social" obrigatorio data-autofoco maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} erro={erros.nome} disabled={!podeEditar} />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoMascara rotulo="CPF ou CNPJ" tipo="documento" valor={f.documento} aoMudar={(v) => setF({ ...f, documento: v })} erro={erros.documento} disabled={!podeEditar} />
          <CampoMascara rotulo="Celular / WhatsApp" tipo="telefone" valor={f.celular} aoMudar={(v) => setF({ ...f, celular: v })} erro={erros.celular} disabled={!podeEditar} />
        </div>
        {!somenteCaixa && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoMascara rotulo="Telefone" tipo="telefone" valor={f.telefone} aoMudar={(v) => setF({ ...f, telefone: v })} erro={erros.telefone} disabled={!podeEditar} />
              <CampoMascara rotulo="Nascimento" tipo="data" valor={f.nascimento} aoMudar={(v) => setF({ ...f, nascimento: v })} erro={erros.data_nascimento} disabled={!podeEditar} />
            </div>
            <CampoTexto rotulo="E-mail" type="email" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} erro={erros.email} disabled={!podeEditar} />
            <section className="border-t border-borda pt-4">
              <button type="button" onClick={() => setVerEndereco((v) => !v)} className="flex w-full items-center justify-between text-sm font-semibold text-texto" aria-expanded={verEndereco}>
                Endereço <ChevronDown size={18} className={`text-texto-3 transition-transform ${verEndereco ? 'rotate-180' : ''}`} />
              </button>
              {verEndereco && (
                <div className="mt-4">
                  <CamposEndereco valor={f.endereco} aoMudar={(e) => setF({ ...f, endereco: e })} erros={erros} desabilitado={!podeEditar} />
                </div>
              )}
            </section>
            <AreaTexto rotulo="Observações" maxLength={500} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} disabled={!podeEditar} />
          </>
        )}
        <button type="submit" hidden />
      </form>

      {c && !novo && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Últimas compras</h3>
            {c.ultimas_compras?.length ? (
              <ul className="flex flex-col gap-1.5">
                {c.ultimas_compras.map((v) => (
                  <li key={v.id} className="flex justify-between rounded-xl bg-superficie-2 px-3.5 py-2 text-sm">
                    <span className="text-texto-2">Nº {v.numero} · {dataHora(v.finalizada_em)}</span>
                    <span className={`tabular font-semibold ${v.situacao === 'cancelada' ? 'text-texto-3 line-through' : 'text-texto'}`}>{dinheiro(v.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-3">Nenhuma compra identificada.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Vales-troca ativos</h3>
            {c.vales_ativos?.length ? (
              <ul className="flex flex-col gap-1.5">
                {c.vales_ativos.map((v) => (
                  <li key={v.id} className="flex justify-between rounded-xl bg-ok-bg px-3.5 py-2 text-sm text-ok-fg">
                    <span className="font-bold tracking-wider">{v.codigo}</span>
                    <span className="tabular">{dinheiro(v.saldo)} · até {data(v.validade)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-3">Nenhum vale ativo.</p>
            )}
          </div>
        </div>
      )}
    </Gaveta>
  )
}

export function Clientes() {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const atraso = useAtraso(busca)
  const usuario = useUsuario()
  useEffect(() => setPagina(1), [atraso, situacao])
  const q = useQuery({
    queryKey: ['clientes', atraso, situacao, pagina],
    queryFn: () => api.get<Lista<Cliente>>('/clientes', { busca: atraso, situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<Cliente>[] = [
    { chave: 'nome', titulo: 'Nome', render: (c) => <span className="font-semibold text-texto">{c.nome}</span> },
    { chave: 'doc', titulo: 'CPF/CNPJ', render: (c) => <span className="tabular">{c.documento ? mascararDocumento(c.documento) : '—'}</span> },
    { chave: 'cel', titulo: 'Celular', render: (c) => <span className="tabular">{c.celular ? mascararTelefone(c.celular) : '—'}</span>, ocultarCelular: true },
    { chave: 'cid', titulo: 'Cidade', render: (c) => (c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '—'), ocultarCelular: true },
    { chave: 'vale', titulo: 'Vale-troca', alinhar: 'direita', render: (c) => (c.saldo_credito > 0 ? <Pilula tom="ok">{dinheiro(c.saldo_credito)}</Pilula> : <span className="text-texto-3">—</span>) },
    { chave: 'sit', titulo: 'Situação', alinhar: 'direita', render: (c) => (c.ativo ? <Pilula tom="ok">Ativo</Pilula> : <Pilula tom="neutro">Inativo</Pilula>), ocultarCelular: true },
  ]
  return (
    <div>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Identifique clientes nas vendas e nas trocas."
        acoes={<Botao icone={<Plus size={18} />} onClick={() => setNovo(true)}>Novo cliente</Botao>}
      />
      <Card>
        <BarraFiltros>
          <CampoTexto className="w-full sm:w-80" rotulo="Buscar" icone={<Search size={16} />} placeholder="Nome, CPF/CNPJ ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} />
          {usuario.perfil !== 'caixa' && (
            <Selecao className="w-36" rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos</option>
            </Selecao>
          )}
        </BarraFiltros>
        <Tabela
          colunas={colunas}
          linhas={q.data?.itens}
          carregando={q.isFetching}
          chaveLinha={(c) => c.id}
          aoClicarLinha={(c) => setAberto(c.id)}
          vazio={{
            titulo: atraso ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado',
            descricao: atraso ? 'Confira a escrita ou busque pelo CPF.' : 'Cadastre clientes para identificar vendas e vales-troca.',
            acao: !atraso ? <Botao icone={<UserPlus size={16} />} onClick={() => setNovo(true)}>Novo cliente</Botao> : undefined,
          }}
        />
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
      </Card>
      <GavetaCliente id={aberto} novo={novo} aoFechar={() => { setAberto(null); setNovo(false) }} />
    </div>
  )
}
