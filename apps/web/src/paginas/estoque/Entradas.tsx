import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus, Trash2 } from 'lucide-react'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Entrada, EntradaLista, Lista, Produto } from '../../api/tipos'
import { useFornecedoresAtivos } from '../../api/consultas'
import { Card } from '../../componentes/ui/Card'
import { Gaveta, Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { AreaTexto, CampoDinheiro, CampoTexto, Interruptor, Selecao, CampoData } from '../../componentes/ui/Campo'
import { BuscaProduto } from '../../componentes/ui/BuscaProduto'
import { Pilula } from '../../componentes/ui/Pilula'
import { Paginacao, Tabela, type Coluna } from '../../componentes/ui/Tabela'
import { BarraFiltros } from '../../componentes/ui/Pagina'
import { useAvisos } from '../../componentes/ui/Avisos'
import { data, dinheiro, hojeIso, quantidade, soDigitos, textoParaQuantidade } from '../../utils/formatos'

interface ItemForm { chave: string; produto_id: string; nome: string; unidade: string; fracionavel: boolean; qtd: string; custo: number }

function CadastroRapido({ nomeInicial, aoCriar, aoFechar }: { nomeInicial: string | null; aoCriar: (p: Produto) => void; aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState(0)
  const [cb, setCb] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  useEffect(() => {
    if (nomeInicial !== null) { setNome(/^\d+$/.test(nomeInicial) ? '' : nomeInicial); setCb(/^\d+$/.test(nomeInicial) ? nomeInicial : ''); setPreco(0); setErros({}) }
  }, [nomeInicial])
  async function salvar(e: React.FormEvent, confirmar = false) {
    e.preventDefault()
    if (nome.trim().length < 2 || preco <= 0) return setErros({ ...(nome.trim().length < 2 ? { nome: 'Informe o nome.' } : {}), ...(preco <= 0 ? { preco_venda: 'Informe o preço de venda.' } : {}) })
    try {
      const p = await api.post<Produto>('/produtos', { nome: nome.trim(), preco_venda: preco, codigo_barras: soDigitos(cb) || null, confirmar_codigo_barras_invalido: confirmar || undefined })
      aoCriar(p)
    } catch (er) {
      if (er instanceof ErroApi && er.codigo === 'CODIGO_BARRAS_INVALIDO' && !confirmar) return salvar(e, true)
      setErros(er instanceof ErroApi && er.campos ? er.campos : { nome: mensagemErro(er) })
    }
  }
  return (
    <Modal aberto={nomeInicial !== null} aoFechar={aoFechar} titulo="Cadastro rápido de produto" descricao="Complete o cadastro depois em Produtos." largura="sm">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome" obrigatorio data-autofoco value={nome} onChange={(e) => setNome(e.target.value)} erro={erros.nome} />
        <CampoDinheiro rotulo="Preço de venda" obrigatorio valor={preco} aoMudar={setPreco} erro={erros.preco_venda} />
        <CampoTexto rotulo="Código de barras" inputMode="numeric" value={cb} onChange={(e) => setCb(soDigitos(e.target.value).slice(0, 14))} erro={erros.codigo_barras} />
        <Botao type="submit">Cadastrar e adicionar</Botao>
      </form>
    </Modal>
  )
}

/** Entrada de mercadoria (nova, rascunho ou confirmada). */
export function GavetaEntrada({ aberto, entradaId, aoFechar }: { aberto: boolean; entradaId: string | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { confirmar, sucesso, erro: avisoErro } = useAvisos()
  const fornecedores = useFornecedoresAtivos()
  const existente = useQuery({ queryKey: ['entrada', entradaId], queryFn: () => api.get<Entrada>(`/entradas/${entradaId}`), enabled: aberto && !!entradaId })
  const [fornecedor, setFornecedor] = useState('')
  const [nota, setNota] = useState('')
  const [dataRec, setDataRec] = useState(hojeIso())
  const [atualizarCusto, setAtualizarCusto] = useState(true)
  const [obs, setObs] = useState('')
  const [itens, setItens] = useState<ItemForm[]>([])
  const [erros, setErros] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState(false)
  const [rapido, setRapido] = useState<string | null>(null)

  const e = existente.data
  const somenteLeitura = e?.situacao === 'confirmada'

  useEffect(() => {
    if (!aberto) return
    if (!entradaId) {
      setFornecedor(''); setNota(''); setDataRec(hojeIso()); setAtualizarCusto(true); setObs(''); setItens([]); setErros({})
    }
  }, [aberto, entradaId])
  useEffect(() => {
    if (e) {
      setFornecedor(e.fornecedor_id ?? ''); setNota(e.numero_nota ?? ''); setDataRec(e.data_recebimento); setAtualizarCusto(e.atualizar_custo); setObs(e.observacoes ?? '')
      setItens(e.itens.map((i) => ({ chave: i.id, produto_id: i.produto_id, nome: i.produto_nome, unidade: i.unidade, fracionavel: ['KG', 'L', 'M'].includes(i.unidade), qtd: quantidade(i.quantidade, i.unidade), custo: i.custo_unitario })))
      setErros({})
    }
  }, [e])

  function adicionar(p: Produto) {
    if (!p.controla_estoque) return avisoErro(`${p.nome} não controla estoque.`)
    if (itens.some((i) => i.produto_id === p.id)) return avisoErro(`${p.nome} já está na lista. Mude a quantidade na linha.`)
    setItens((l) => [...l, { chave: p.id, produto_id: p.id, nome: p.nome, unidade: p.unidade, fracionavel: p.fracionavel, qtd: '', custo: p.preco_custo ?? 0 }])
  }

  const total = itens.reduce((s, i) => s + Math.round((textoParaQuantidade(i.qtd) || 0) * i.custo), 0)

  async function salvar(confirmarAgora: boolean) {
    const er: Record<string, string> = {}
    if (itens.length === 0) er.itens = 'Adicione pelo menos um produto.'
    itens.forEach((i, n) => {
      const q = textoParaQuantidade(i.qtd)
      if (!(q > 0)) er[`itens.${n}.quantidade`] = 'Informe a quantidade.'
      else if (!i.fracionavel && !Number.isInteger(q)) er[`itens.${n}.quantidade`] = 'Só inteiro.'
    })
    if (dataRec > hojeIso()) er.data_recebimento = 'A data não pode ser futura.'
    setErros(er)
    if (Object.keys(er).length) return
    if (confirmarAgora) {
      const ok = await confirmar({ titulo: 'Confirmar entrada?', mensagem: `As quantidades entram no estoque agora (${itens.length} produtos, ${dinheiro(total)}). Depois de confirmada, a entrada não se edita.`, confirmar: 'Confirmar entrada' })
      if (ok === null) return
    }
    const corpo = {
      fornecedor_id: fornecedor || null,
      numero_nota: nota.trim() || null,
      data_recebimento: dataRec,
      atualizar_custo: atualizarCusto,
      observacoes: obs.trim() || null,
      itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: textoParaQuantidade(i.qtd), custo_unitario: i.custo })),
    }
    setSalvando(true)
    try {
      if (e) {
        await api.put(`/entradas/${e.id}`, { ...corpo, versao: e.versao })
        if (confirmarAgora) await api.post(`/entradas/${e.id}/confirmar`)
      } else await api.post('/entradas', { ...corpo, confirmar: confirmarAgora })
      sucesso(confirmarAgora ? 'Entrada confirmada. O estoque foi atualizado.' : 'Rascunho salvo.')
      qc.invalidateQueries({ queryKey: ['entradas'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      aoFechar()
    } catch (er2) {
      if (er2 instanceof ErroApi && er2.campos) setErros(er2.campos)
      else avisoErro(mensagemErro(er2))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Gaveta
      aberto={aberto}
      aoFechar={aoFechar}
      largura="max-w-3xl"
      titulo={e ? `Entrada nº ${e.numero}` : 'Nova entrada de mercadoria'}
      descricao={e ? (somenteLeitura ? 'Confirmada. Para corrigir, faça um ajuste de estoque.' : 'Rascunho. O estoque ainda não mudou.') : 'Chegou mercadoria? Registre aqui para somar ao estoque.'}
      rodape={
        !somenteLeitura && (
          <>
            <span className="tabular mr-auto self-center text-sm text-texto-2">
              Total: <b className="text-texto">{dinheiro(total)}</b>
            </span>
            <Botao variante="contorno" carregando={salvando} onClick={() => salvar(false)}>Salvar rascunho</Botao>
            <Botao carregando={salvando} onClick={() => salvar(true)}>Confirmar entrada</Botao>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {e && <div>{somenteLeitura ? <Pilula tom="ok">Confirmada</Pilula> : <Pilula tom="aviso">Rascunho</Pilula>}</div>}
        <div className="grid gap-4 sm:grid-cols-3">
          <Selecao className="sm:col-span-1" rotulo="Fornecedor" value={fornecedor} onChange={(x) => setFornecedor(x.target.value)} disabled={somenteLeitura}>
            <option value="">Sem fornecedor</option>
            {fornecedores.data?.map((f) => (
              <option key={f.id} value={f.id}>{f.nome_fantasia}</option>
            ))}
            {e?.fornecedor_id && !fornecedores.data?.some((f) => f.id === e.fornecedor_id) && <option value={e.fornecedor_id}>{e.fornecedor_nome}</option>}
          </Selecao>
          <CampoTexto rotulo="Nº da nota ou pedido" maxLength={30} value={nota} onChange={(x) => setNota(x.target.value)} disabled={somenteLeitura} />
          <CampoData rotulo="Recebido em" valor={dataRec} aoMudar={(v) => setDataRec(v)} erro={erros.data_recebimento} disabled={somenteLeitura} />
        </div>
        {!somenteLeitura && (
          <BuscaProduto
            rotulo="Adicionar produto"
            aoEscolher={adicionar}
            erro={erros.itens}
            semResultado={(t) => (
              <button type="button" className="mt-2 block font-semibold text-primaria hover:underline" onClick={() => setRapido(t)}>
                Cadastrar “{t}” agora
              </button>
            )}
          />
        )}
        {itens.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-borda">
            <table className="w-full text-sm">
              <thead className="bg-superficie-2 text-xs font-semibold tracking-wide text-texto-3 uppercase">
                <tr>
                  <th className="px-4 py-2.5 text-left">Produto</th>
                  <th className="w-32 px-2 py-2.5 text-right">Quantidade</th>
                  <th className="w-40 px-2 py-2.5 text-right">Custo unitário</th>
                  <th className="w-28 px-4 py-2.5 text-right">Total</th>
                  {!somenteLeitura && <th className="w-10" />}
                </tr>
              </thead>
              <tbody>
                {itens.map((i, n) => (
                  <tr key={i.chave} className="border-t border-borda">
                    <td className="px-4 py-2 font-semibold text-texto">{i.nome}</td>
                    <td className="px-2 py-2">
                      {somenteLeitura ? (
                        <p className="tabular text-right">{i.qtd} {i.unidade}</p>
                      ) : (
                        <CampoTexto
                          aria-label={`Quantidade de ${i.nome}`}
                          inputMode="decimal"
                          value={i.qtd}
                          erro={erros[`itens.${n}.quantidade`]}
                          onChange={(x) => setItens((l) => l.map((y) => (y.chave === i.chave ? { ...y, qtd: x.target.value.replace(/[^\d,]/g, '') } : y)))}
                        />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {somenteLeitura ? (
                        <p className="tabular text-right">{dinheiro(i.custo)}</p>
                      ) : (
                        <CampoDinheiro aria-label={`Custo de ${i.nome}`} valor={i.custo} aoMudar={(v) => setItens((l) => l.map((y) => (y.chave === i.chave ? { ...y, custo: v } : y)))} />
                      )}
                    </td>
                    <td className="tabular px-4 py-2 text-right font-semibold text-texto">{dinheiro(Math.round((textoParaQuantidade(i.qtd) || 0) * i.custo))}</td>
                    {!somenteLeitura && (
                      <td className="pr-3">
                        <button type="button" aria-label={`Tirar ${i.nome}`} onClick={() => setItens((l) => l.filter((y) => y.chave !== i.chave))} className="text-texto-3 hover:text-erro-fg">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Interruptor rotulo="Atualizar o custo dos produtos" descricao="O preço de custo passa a ser o desta entrada." marcado={atualizarCusto} aoMudar={setAtualizarCusto} desabilitado={somenteLeitura} />
        <AreaTexto rotulo="Observações" rows={2} maxLength={500} value={obs} onChange={(x) => setObs(x.target.value)} disabled={somenteLeitura} />
      </div>
      <CadastroRapido nomeInicial={rapido} aoFechar={() => setRapido(null)} aoCriar={(p) => { setRapido(null); adicionar(p); qc.invalidateQueries({ queryKey: ['produtos'] }) }} />
    </Gaveta>
  )
}

export function ListaEntradas({ abrir }: { abrir: (id: string | null) => void }) {
  const [situacao, setSituacao] = useState('')
  const [pagina, setPagina] = useState(1)
  const q = useQuery({
    queryKey: ['entradas', situacao, pagina],
    queryFn: () => api.get<Lista<EntradaLista>>('/entradas', { situacao, pagina, por_pagina: 50 }),
    placeholderData: keepPreviousData,
  })
  const colunas: Coluna<EntradaLista>[] = [
    { chave: 'n', titulo: 'Nº', render: (e) => <span className="tabular font-semibold text-texto">{e.numero}</span>, largura: '70px' },
    { chave: 'data', titulo: 'Recebido em', render: (e) => <span className="tabular">{data(e.data_recebimento)}</span> },
    { chave: 'forn', titulo: 'Fornecedor', render: (e) => e.fornecedor_nome ?? '—' },
    { chave: 'nota', titulo: 'Nota', render: (e) => e.numero_nota ?? '—', ocultarCelular: true },
    { chave: 'itens', titulo: 'Itens', alinhar: 'direita', render: (e) => <span className="tabular">{e.quantidade_itens}</span>, ocultarCelular: true },
    { chave: 'total', titulo: 'Total', alinhar: 'direita', render: (e) => <span className="tabular font-semibold text-texto">{dinheiro(e.total)}</span> },
    { chave: 'sit', titulo: 'Situação', alinhar: 'direita', render: (e) => (e.situacao === 'confirmada' ? <Pilula tom="ok">Confirmada</Pilula> : <Pilula tom="aviso">Rascunho</Pilula>) },
  ]
  return (
    <Card>
      <BarraFiltros>
        <Selecao className="w-44" rotulo="Situação" value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1) }}>
          <option value="">Todas</option>
          <option value="rascunho">Rascunhos</option>
          <option value="confirmada">Confirmadas</option>
        </Selecao>
      </BarraFiltros>
      <Tabela
        colunas={colunas}
        linhas={q.data?.itens}
        carregando={q.isFetching}
        chaveLinha={(e) => e.id}
        aoClicarLinha={(e) => abrir(e.id)}
        vazio={{ titulo: 'Nenhuma entrada ainda', descricao: 'Quando chegar mercadoria, registre a entrada para somar ao estoque.', acao: <Botao icone={<PackagePlus size={16} />} onClick={() => abrir(null)}>Nova entrada</Botao> }}
      />
      {q.data && <Paginacao pagina={pagina} total={q.data.total} porPagina={50} aoMudar={setPagina} />}
    </Card>
  )
}
