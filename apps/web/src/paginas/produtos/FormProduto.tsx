import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus } from 'lucide-react'
import { Gaveta } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { AreaTexto, CampoDinheiro, CampoTexto, Interruptor, Selecao } from '../../componentes/ui/Campo'
import { Pilula } from '../../componentes/ui/Pilula'
import { useAvisos } from '../../componentes/ui/Avisos'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import type { Categoria, Produto } from '../../api/tipos'
import { useCategorias, useFornecedoresAtivos } from '../../api/consultas'
import { useUsuario } from '../../ganchos/useSessao'
import { pode } from '../../utils/permissoes'
import { fracionavel, percentual, quantidade, soDigitos, textoParaQuantidade, UNIDADES } from '../../utils/formatos'

interface Form {
  nome: string
  codigo_barras: string
  preco_venda: number
  unidade: string
  categoria_id: string
  controla_estoque: boolean
  estoque_inicial: string
  estoque_minimo: string
  preco_custo: number
  codigo: string
  fornecedor_id: string
  observacoes: string
}

const vazio = (base?: Partial<Form>): Form => ({
  nome: '', codigo_barras: '', preco_venda: 0, unidade: 'UN', categoria_id: '', controla_estoque: true, estoque_inicial: '', estoque_minimo: '',
  preco_custo: 0, codigo: '', fornecedor_id: '', observacoes: '', ...base,
})

function deProduto(p: Produto): Form {
  return {
    nome: p.nome, codigo_barras: p.codigo_barras ?? '', preco_venda: p.preco_venda, unidade: p.unidade, categoria_id: p.categoria_id ?? '',
    controla_estoque: p.controla_estoque, estoque_inicial: '', estoque_minimo: p.estoque_minimo ? quantidade(p.estoque_minimo, p.unidade) : '',
    preco_custo: p.preco_custo ?? 0, codigo: p.codigo, fornecedor_id: p.fornecedor_id ?? '', observacoes: p.observacoes ?? '',
  }
}

function Secao({ titulo, aberta, alternar, children }: { titulo: string; aberta: boolean; alternar: () => void; children: React.ReactNode }) {
  return (
    <section className="border-t border-borda pt-4">
      <button type="button" onClick={alternar} className="flex w-full items-center justify-between text-left" aria-expanded={aberta}>
        <span className="text-sm font-semibold text-texto">{titulo}</span>
        <ChevronDown size={18} className={`text-texto-3 transition-transform ${aberta ? 'rotate-180' : ''}`} />
      </button>
      {aberta && <div className="mt-4 flex flex-col gap-4">{children}</div>}
    </section>
  )
}

/** Gaveta de cadastro de produto. Só nome e preço são obrigatórios. */
export function FormProduto({ aberto, produto, aoFechar }: { aberto: boolean; produto: Produto | null; aoFechar: () => void }) {
  const usuario = useUsuario()
  const podeEditar = pode.editarCadastros(usuario.perfil)
  const verCusto = pode.verCusto(usuario.perfil)
  const qc = useQueryClient()
  const { confirmar, sucesso, erro: avisoErro } = useAvisos()
  const categorias = useCategorias('ativos')
  const fornecedores = useFornecedoresAtivos(podeEditar)
  const [f, setF] = useState<Form>(vazio())
  const [inicial, setInicial] = useState<Form>(vazio())
  const [erros, setErros] = useState<Record<string, string>>({})
  const [secoes, setSecoes] = useState({ estoque: false, custo: false, mais: false })
  const [novaCat, setNovaCat] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const base = produto ? deProduto(produto) : vazio()
    setF(base)
    setInicial(base)
    setErros({})
    setNovaCat(null)
    setSecoes({ estoque: !!produto, custo: !!produto && verCusto, mais: false })
  }, [aberto, produto, verCusto])

  const sujo = JSON.stringify(f) !== JSON.stringify(inicial)
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const margem = f.preco_custo > 0 && f.preco_venda > 0 ? ((f.preco_venda - f.preco_custo) / f.preco_venda) * 100 : null

  async function fechar() {
    if (sujo && podeEditar) {
      const ok = await confirmar({ titulo: 'Sair sem salvar?', mensagem: 'As alterações deste produto serão perdidas.', confirmar: 'Sair sem salvar', cancelar: 'Continuar editando' })
      if (ok === null) return
    }
    aoFechar()
  }

  async function criarCategoria() {
    const nome = (novaCat ?? '').trim()
    if (nome.length < 2) return setErros((e) => ({ ...e, categoria_id: 'Informe o nome da categoria.' }))
    try {
      const c = await api.post<Categoria>('/categorias', { nome })
      await qc.invalidateQueries({ queryKey: ['categorias'] })
      set('categoria_id', c.id)
      setNovaCat(null)
    } catch (e) {
      setErros((x) => ({ ...x, categoria_id: e instanceof ErroApi && e.campos?.nome ? e.campos.nome : mensagemErro(e) }))
    }
  }

  async function salvar(continuar: boolean, confirmarCodigo = false) {
    const er: Record<string, string> = {}
    if (f.nome.trim().length < 2) er.nome = 'Informe o nome do produto.'
    if (f.preco_venda <= 0) er.preco_venda = 'Informe o preço de venda.'
    const cb = soDigitos(f.codigo_barras)
    if (cb && ![8, 12, 13, 14].includes(cb.length)) er.codigo_barras = 'O código de barras tem 8, 12, 13 ou 14 números.'
    const ei = f.estoque_inicial ? textoParaQuantidade(f.estoque_inicial) : 0
    const em = f.estoque_minimo ? textoParaQuantidade(f.estoque_minimo) : 0
    if (!fracionavel(f.unidade) && (!Number.isInteger(ei) || !Number.isInteger(em))) er.estoque_minimo = 'Esta unidade só aceita quantidades inteiras.'
    setErros(er)
    if (Object.keys(er).length) {
      if (er.estoque_minimo) setSecoes((s) => ({ ...s, estoque: true }))
      return
    }
    const corpo: Record<string, unknown> = {
      nome: f.nome.trim(),
      codigo_barras: cb || null,
      preco_venda: f.preco_venda,
      unidade: f.unidade,
      categoria_id: f.categoria_id || null,
      controla_estoque: f.controla_estoque,
      estoque_minimo: f.controla_estoque ? em : 0,
      fornecedor_id: f.fornecedor_id || null,
      observacoes: f.observacoes.trim() || null,
    }
    if (verCusto) corpo.preco_custo = f.preco_custo
    if (f.codigo.trim()) corpo.codigo = f.codigo.trim()
    if (!produto && f.controla_estoque && ei > 0) corpo.estoque_inicial = ei
    if (confirmarCodigo) corpo.confirmar_codigo_barras_invalido = true
    setSalvando(true)
    try {
      if (produto) await api.put<Produto>(`/produtos/${produto.id}`, { ...corpo, versao: produto.versao })
      else await api.post<Produto>('/produtos', corpo)
      sucesso(produto ? 'Produto salvo.' : `${f.nome.trim()} cadastrado.`)
      qc.invalidateQueries({ queryKey: ['produtos'] })
      qc.invalidateQueries({ queryKey: ['categorias'] })
      if (continuar && !produto) {
        const base = vazio({ categoria_id: f.categoria_id, unidade: f.unidade })
        setF(base)
        setInicial(base)
      } else aoFechar()
    } catch (e) {
      if (e instanceof ErroApi && e.codigo === 'CODIGO_BARRAS_INVALIDO') {
        const ok = await confirmar({
          titulo: 'Código de barras fora do padrão',
          mensagem: 'O último dígito não confere. Códigos de balança ou do fornecedor às vezes são assim. Quer salvar mesmo assim?',
          confirmar: 'Salvar mesmo assim',
          cancelar: 'Corrigir código',
        })
        if (ok !== null) return salvar(continuar, true)
      } else if (e instanceof ErroApi && e.codigo === 'CONFLITO_VERSAO') {
        avisoErro('Outra pessoa salvou este produto enquanto você editava. Feche e abra de novo para ver a versão atual.')
      } else if (e instanceof ErroApi && e.campos) {
        const existente = e.dados.produto_existente as { nome?: string; codigo?: string } | undefined
        const c = { ...e.campos }
        if (existente?.nome) {
          if (c.codigo_barras) c.codigo_barras = `Já usado em: ${existente.nome} (${existente.codigo}).`
          if (c.codigo) c.codigo = `Já usado em: ${existente.nome}.`
        }
        setErros(c)
        if (c.codigo) setSecoes((s) => ({ ...s, mais: true }))
      } else avisoErro(mensagemErro(e))
    } finally {
      setSalvando(false)
    }
  }

  async function mudarSituacao() {
    if (!produto) return
    if (produto.ativo) {
      const ok = await confirmar({ titulo: `Inativar ${produto.nome}?`, mensagem: 'O produto some do caixa, mas continua no histórico. Dá para reativar depois.', confirmar: 'Inativar produto' })
      if (ok === null) return
    }
    try {
      await api.post(`/produtos/${produto.id}/${produto.ativo ? 'inativar' : 'reativar'}`)
      sucesso(produto.ativo ? 'Produto inativado.' : 'Produto reativado.')
      qc.invalidateQueries({ queryKey: ['produtos'] })
      aoFechar()
    } catch (e) {
      avisoErro(mensagemErro(e))
    }
  }

  async function excluir() {
    if (!produto) return
    const ok = await confirmar({ titulo: `Excluir ${produto.nome}?`, mensagem: 'Use só para cadastro feito por engano. Produto que já vendeu precisa ser inativado.', confirmar: 'Excluir produto', perigo: true })
    if (ok === null) return
    try {
      await api.delete(`/produtos/${produto.id}`)
      sucesso('Produto excluído.')
      qc.invalidateQueries({ queryKey: ['produtos'] })
      aoFechar()
    } catch (e) {
      avisoErro(e instanceof ErroApi && e.codigo === 'PRODUTO_COM_MOVIMENTACAO' ? 'Este produto já teve movimentação. Inative em vez de excluir.' : mensagemErro(e))
    }
  }

  const so = !podeEditar

  return (
    <Gaveta
      aberto={aberto}
      aoFechar={fechar}
      titulo={produto ? produto.nome : 'Novo produto'}
      descricao={produto ? `Código ${produto.codigo}` : 'Para cadastrar basta nome e preço. O resto é opcional.'}
      rodape={
        podeEditar ? (
          <>
            {produto && (
              <>
                <Botao variante="fantasma" className="mr-auto text-erro-fg" onClick={excluir}>
                  Excluir
                </Botao>
                <Botao variante="contorno" onClick={mudarSituacao}>
                  {produto.ativo ? 'Inativar' : 'Reativar'}
                </Botao>
              </>
            )}
            {!produto && (
              <Botao variante="contorno" carregando={salvando} onClick={() => salvar(true)}>
                Salvar e cadastrar outro
              </Botao>
            )}
            <Botao carregando={salvando} onClick={() => salvar(false)}>
              {produto ? 'Salvar alterações' : 'Salvar produto'}
            </Botao>
          </>
        ) : undefined
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (podeEditar) salvar(false)
        }}
        className="flex flex-col gap-4"
      >
        {produto && !produto.ativo && <Pilula tom="neutro">Produto inativo</Pilula>}
        <CampoTexto rotulo="Nome" obrigatorio data-autofoco maxLength={80} value={f.nome} onChange={(e) => set('nome', e.target.value)} erro={erros.nome} disabled={so} ajuda="É o que aparece no caixa e no recibo." />
        <div className="grid grid-cols-2 gap-4">
          <CampoDinheiro rotulo="Preço de venda" obrigatorio valor={f.preco_venda} aoMudar={(v) => set('preco_venda', v)} erro={erros.preco_venda} disabled={so} />
          <Selecao rotulo="Unidade" value={f.unidade} onChange={(e) => set('unidade', e.target.value)} disabled={so} ajuda={fracionavel(f.unidade) ? 'Aceita quantidade com vírgula.' : undefined}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </Selecao>
        </div>
        <CampoTexto rotulo="Código de barras" inputMode="numeric" placeholder="Leia com o leitor ou digite" value={f.codigo_barras} onChange={(e) => set('codigo_barras', soDigitos(e.target.value).slice(0, 14))} erro={erros.codigo_barras} disabled={so} />
        {novaCat === null ? (
          <Selecao
            rotulo="Categoria"
            value={f.categoria_id}
            disabled={so}
            erro={erros.categoria_id}
            onChange={(e) => (e.target.value === '__nova__' ? setNovaCat('') : set('categoria_id', e.target.value))}
          >
            <option value="">Sem categoria</option>
            {categorias.data?.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
            {podeEditar && <option value="__nova__">+ Criar categoria</option>}
          </Selecao>
        ) : (
          <div className="flex items-end gap-2">
            <CampoTexto className="flex-1" rotulo="Nova categoria" autoFocus value={novaCat} onChange={(e) => setNovaCat(e.target.value)} erro={erros.categoria_id} maxLength={50} />
            <Botao icone={<Plus size={16} />} onClick={criarCategoria}>Criar</Botao>
            <Botao variante="fantasma" onClick={() => setNovaCat(null)}>Voltar</Botao>
          </div>
        )}

        <Secao titulo="Estoque" aberta={secoes.estoque} alternar={() => setSecoes((s) => ({ ...s, estoque: !s.estoque }))}>
          <Interruptor rotulo="Controla estoque" descricao="Desligue para serviços e itens como sacolas." marcado={f.controla_estoque} aoMudar={(v) => set('controla_estoque', v)} desabilitado={so} />
          {f.controla_estoque && (
            <div className="grid grid-cols-2 gap-4">
              {produto ? (
                <CampoTexto rotulo="Estoque atual" value={`${quantidade(produto.estoque_atual, produto.unidade)} ${produto.unidade}`} disabled ajuda="Muda só por entrada, ajuste ou venda." />
              ) : (
                <CampoTexto rotulo="Estoque inicial" inputMode="decimal" value={f.estoque_inicial} onChange={(e) => set('estoque_inicial', e.target.value.replace(/[^\d,]/g, ''))} />
              )}
              <CampoTexto rotulo="Estoque mínimo" inputMode="decimal" value={f.estoque_minimo} onChange={(e) => set('estoque_minimo', e.target.value.replace(/[^\d,]/g, ''))} erro={erros.estoque_minimo} disabled={so} ajuda="Abaixo disso, o produto aparece em Estoque baixo." />
            </div>
          )}
        </Secao>

        {verCusto && (
          <Secao titulo="Custo e margem" aberta={secoes.custo} alternar={() => setSecoes((s) => ({ ...s, custo: !s.custo }))}>
            <div className="grid grid-cols-2 gap-4">
              <CampoDinheiro rotulo="Preço de custo" valor={f.preco_custo} aoMudar={(v) => set('preco_custo', v)} erro={erros.preco_custo} disabled={so} />
              <CampoTexto rotulo="Margem" value={margem === null ? '—' : percentual(Math.round(margem * 10) / 10)} disabled />
            </div>
            {f.preco_custo > f.preco_venda && f.preco_venda > 0 && <p className="rounded-xl bg-aviso-bg px-3.5 py-2.5 text-sm font-medium text-aviso-fg">O preço de venda está abaixo do custo.</p>}
          </Secao>
        )}

        <Secao titulo="Mais informações" aberta={secoes.mais} alternar={() => setSecoes((s) => ({ ...s, mais: !s.mais }))}>
          <CampoTexto rotulo="Código interno" maxLength={20} placeholder="Gerado automaticamente" value={f.codigo} onChange={(e) => set('codigo', e.target.value)} erro={erros.codigo} disabled={so} />
          {podeEditar && (
            <Selecao rotulo="Fornecedor principal" value={f.fornecedor_id} onChange={(e) => set('fornecedor_id', e.target.value)}>
              <option value="">Nenhum</option>
              {fornecedores.data?.map((x) => (
                <option key={x.id} value={x.id}>{x.nome_fantasia}</option>
              ))}
            </Selecao>
          )}
          <AreaTexto rotulo="Observações" ajuda="Uso interno. Não aparece no caixa." maxLength={500} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} disabled={so} />
        </Secao>
        <button type="submit" hidden />
      </form>
    </Gaveta>
  )
}
