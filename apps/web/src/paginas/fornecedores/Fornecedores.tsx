import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Truck } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Fornecedor, Lista } from '../../api/tipos'
import { useAtraso } from '../../ganchos/useAtraso'
import { BarraFiltros, CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card } from '../../componentes/ui/Card'
import { AreaTexto, CampoMascara, CampoTexto, Selecao } from '../../componentes/ui/Campo'
import { Botao } from '../../componentes/ui/Botao'
import { Pilula } from '../../componentes/ui/Pilula'
import { Gaveta } from '../../componentes/ui/Modal'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { CamposEndereco, enderecoDe, enderecoParaApi, enderecoVazio, type Endereco } from '../../componentes/ui/CamposEndereco'
import { useAvisos } from '../../componentes/ui/Avisos'
import { data, dinheiro, emailValido, erroDocumento, mascararDocumento, mascararTelefone, quantidade, soDigitos } from '../../utils/formatos'

interface Form { nome_fantasia: string; razao_social: string; documento: string; contato: string; telefone: string; email: string; observacoes: string; endereco: Endereco }
const vazio: Form = { nome_fantasia: '', razao_social: '', documento: '', contato: '', telefone: '', email: '', observacoes: '', endereco: enderecoVazio }

function GavetaFornecedor({ id, novo, aoFechar }: { id: string | null; novo: boolean; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { confirmar, sucesso, erro } = useAvisos()
  const ficha = useQuery({ queryKey: ['fornecedor', id], queryFn: () => api.get<Fornecedor>(`/fornecedores/${id}`), enabled: !!id })
  const fo = ficha.data
  const [f, setF] = useState<Form>(vazio)
  const [inicial, setInicial] = useState<Form>(vazio)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (novo) { setF(vazio); setInicial(vazio); setErros({}) }
  }, [novo])
  useEffect(() => {
    if (fo && id) {
      const b: Form = {
        nome_fantasia: fo.nome_fantasia, razao_social: fo.razao_social ?? '', documento: fo.documento ?? '', contato: fo.contato ?? '',
        telefone: fo.telefone ?? '', email: fo.email ?? '', observacoes: fo.observacoes ?? '', endereco: enderecoDe(fo),
      }
      setF(b); setInicial(b); setErros({})
    }
  }, [fo, id])

  async function fechar() {
    if (JSON.stringify(f) !== JSON.stringify(inicial)) {
      const ok = await confirmar({ titulo: 'Sair sem salvar?', mensagem: 'As alterações serão perdidas.', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando' })
      if (ok === null) return
    }
    aoFechar()
  }

  async function salvar(e?: React.FormEvent) {
    e?.preventDefault()
    const er: Record<string, string> = {}
    if (f.nome_fantasia.trim().length < 2) er.nome_fantasia = 'Informe o nome do fornecedor.'
    const d = erroDocumento(f.documento)
    if (d) er.documento = d
    if (f.email && !emailValido(f.email)) er.email = 'Confira o e-mail.'
    setErros(er)
    if (Object.keys(er).length) return
    const corpo = {
      nome_fantasia: f.nome_fantasia.trim(), razao_social: f.razao_social.trim() || null, documento: soDigitos(f.documento) || null, contato: f.contato.trim() || null,
      telefone: soDigitos(f.telefone) || null, email: f.email.trim() || null, observacoes: f.observacoes.trim() || null, ...enderecoParaApi(f.endereco),
    }
    setSalvando(true)
    try {
      if (fo && id) await api.put(`/fornecedores/${fo.id}`, { ...corpo, versao: fo.versao })
      else await api.post('/fornecedores', corpo)
      sucesso('Fornecedor salvo.')
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      qc.invalidateQueries({ queryKey: ['fornecedor', id] })
      aoFechar()
    } catch (er2) {
      if (er2 instanceof ErroApi && er2.campos) {
        const ex = er2.dados.fornecedor_existente as { nome_fantasia?: string } | undefined
        setErros({ ...er2.campos, ...(ex?.nome_fantasia ? { documento: `Já cadastrado para ${ex.nome_fantasia}.` } : {}) })
      } else erro(mensagemErro(er2))
    } finally {
      setSalvando(false)
    }
  }

  async function situacao() {
    if (!fo) return
    if (fo.ativo) {
      const ok = await confirmar({ titulo: `Inativar ${fo.nome_fantasia}?`, mensagem: 'Ele não aparece mais nas novas entradas de mercadoria.', confirmar: 'Inativar fornecedor' })
      if (ok === null) return
    }
    try {
      await api.post(`/fornecedores/${fo.id}/${fo.ativo ? 'inativar' : 'reativar'}`)
      qc.invalidateQueries({ queryKey: ['fornecedores'] })
      qc.invalidateQueries({ queryKey: ['fornecedor', id] })
    } catch (er) {
      erro(mensagemErro(er))
    }
  }

  return (
    <Gaveta
      aberto={novo || !!id}
      aoFechar={fechar}
      largura="max-w-2xl"
      titulo={novo ? 'Novo fornecedor' : fo?.nome_fantasia ?? 'Fornecedor'}
      descricao={novo ? 'Só o nome é obrigatório.' : undefined}
      rodape={
        <>
          {fo && !novo && (
            <Botao variante="contorno" className="mr-auto" onClick={situacao}>
              {fo.ativo ? 'Inativar' : 'Reativar'}
            </Botao>
          )}
          <Botao carregando={salvando} onClick={() => salvar()}>Salvar fornecedor</Botao>
        </>
      }
    >
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {fo && !fo.ativo && <Pilula tom="neutro">Fornecedor inativo</Pilula>}
        <CampoTexto rotulo="Nome fantasia" obrigatorio data-autofoco maxLength={80} value={f.nome_fantasia} onChange={(e) => setF({ ...f, nome_fantasia: e.target.value })} erro={erros.nome_fantasia} />
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto rotulo="Razão social" maxLength={120} value={f.razao_social} onChange={(e) => setF({ ...f, razao_social: e.target.value })} />
          <CampoMascara rotulo="CNPJ ou CPF" tipo="documento" valor={f.documento} aoMudar={(v) => setF({ ...f, documento: v })} erro={erros.documento} />
          <CampoTexto rotulo="Contato (vendedor)" maxLength={80} value={f.contato} onChange={(e) => setF({ ...f, contato: e.target.value })} />
          <CampoMascara rotulo="Telefone" tipo="telefone" valor={f.telefone} aoMudar={(v) => setF({ ...f, telefone: v })} erro={erros.telefone} />
        </div>
        <CampoTexto rotulo="E-mail" type="email" maxLength={120} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} erro={erros.email} />
        <CamposEndereco valor={f.endereco} aoMudar={(e) => setF({ ...f, endereco: e })} erros={erros} />
        <AreaTexto rotulo="Observações" placeholder="Ex.: entrega às terças, pedido mínimo" maxLength={500} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        <button type="submit" hidden />
      </form>
      {fo && !novo && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Produtos deste fornecedor</h3>
            {fo.produtos?.length ? (
              <ul className="flex flex-col gap-1.5">
                {fo.produtos.slice(0, 10).map((p) => (
                  <li key={p.id} className="flex justify-between rounded-xl bg-superficie-2 px-3.5 py-2 text-sm">
                    <span className="truncate text-texto-2">{p.nome}</span>
                    <span className="tabular text-texto">{quantidade(p.estoque_atual)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-3">Nenhum produto com este fornecedor principal.</p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">Últimas entradas</h3>
            {fo.ultimas_entradas?.length ? (
              <ul className="flex flex-col gap-1.5">
                {fo.ultimas_entradas.map((e) => (
                  <li key={e.id} className="flex justify-between rounded-xl bg-superficie-2 px-3.5 py-2 text-sm">
                    <span className="text-texto-2">Nº {e.numero} · {data(e.data_recebimento)}</span>
                    <span className="tabular font-semibold text-texto">{dinheiro(e.total)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-texto-3">Nenhuma entrada ainda.</p>
            )}
          </div>
        </div>
      )}
    </Gaveta>
  )
}

export function Fornecedores() {
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('ativos')
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const atraso = useAtraso(busca)
  useEffect(() => setPagina(1), [atraso, situacao])
  const q = useQuery({
    queryKey: ['fornecedores', atraso, situacao, pagina],
    queryFn: () => api.get<Lista<Fornecedor>>('/fornecedores', { busca: atraso, situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<Fornecedor>[] = [
    { chave: 'n', titulo: 'Fornecedor', render: (f) => <div><p className="font-semibold text-texto">{f.nome_fantasia}</p>{f.razao_social && <p className="text-xs text-texto-3">{f.razao_social}</p>}</div> },
    { chave: 'd', titulo: 'CNPJ/CPF', render: (f) => <span className="tabular">{f.documento ? mascararDocumento(f.documento) : '—'}</span>, ocultarCelular: true },
    { chave: 'c', titulo: 'Contato', render: (f) => f.contato ?? '—' },
    { chave: 't', titulo: 'Telefone', render: (f) => <span className="tabular">{f.telefone ? mascararTelefone(f.telefone) : '—'}</span>, ocultarCelular: true },
    { chave: 's', titulo: 'Situação', alinhar: 'direita', render: (f) => (f.ativo ? <Pilula tom="ok">Ativo</Pilula> : <Pilula tom="neutro">Inativo</Pilula>) },
  ]
  return (
    <div>
      <CabecalhoPagina titulo="Fornecedores" descricao="De quem a loja compra." acoes={<Botao icone={<Plus size={18} />} onClick={() => setNovo(true)}>Novo fornecedor</Botao>} />
      <Card>
        <BarraFiltros>
          <CampoTexto className="w-full sm:w-80" rotulo="Buscar" icone={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
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
          chaveLinha={(f) => f.id}
          aoClicarLinha={(f) => setAberto(f.id)}
          vazio={{ titulo: 'Nenhum fornecedor', descricao: 'Cadastre fornecedores para usar nas entradas de mercadoria.', acao: <Botao icone={<Truck size={16} />} onClick={() => setNovo(true)}>Novo fornecedor</Botao> }}
        />
        {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
      </Card>
      <GavetaFornecedor id={aberto} novo={novo} aoFechar={() => { setAberto(null); setNovo(false) }} />
    </div>
  )
}
