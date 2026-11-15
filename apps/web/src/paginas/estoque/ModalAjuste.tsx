import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { AreaTexto, CampoTexto, Segmentado, Selecao } from '../../componentes/ui/Campo'
import { BuscaProduto } from '../../componentes/ui/BuscaProduto'
import { useAvisos } from '../../componentes/ui/Avisos'
import { api, ErroApi, mensagemErro } from '../../api/cliente'
import { NOMES_MOTIVO_AJUSTE, quantidade, textoParaQuantidade } from '../../utils/formatos'

export interface ProdutoAjuste { id: string; nome: string; unidade: string; estoque_atual: number; fracionavel: boolean }

/** Ajuste manual: adicionar, retirar ou "a quantidade correta é X". */
export function ModalAjuste({ aberto, produtoInicial, aoFechar }: { aberto: boolean; produtoInicial: ProdutoAjuste | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const { sucesso } = useAvisos()
  const [produto, setProduto] = useState<ProdutoAjuste | null>(null)
  const [operacao, setOperacao] = useState<'adicionar' | 'retirar' | 'definir'>('definir')
  const [qtd, setQtd] = useState('')
  const [motivo, setMotivo] = useState('correcao_lancamento')
  const [texto, setTexto] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (aberto) {
      setProduto(produtoInicial)
      setOperacao('definir')
      setQtd('')
      setMotivo('correcao_lancamento')
      setTexto('')
      setErros({})
    }
  }, [aberto, produtoInicial])

  const n = textoParaQuantidade(qtd)
  const resultado = produto && n >= 0 ? (operacao === 'definir' ? n : operacao === 'adicionar' ? produto.estoque_atual + n : produto.estoque_atual - n) : null

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    const er: Record<string, string> = {}
    if (!produto) er.produto = 'Escolha o produto.'
    if (!(n >= 0) || qtd === '' || (operacao !== 'definir' && n === 0)) er.quantidade = 'Informe a quantidade.'
    else if (produto && !produto.fracionavel && !Number.isInteger(n)) er.quantidade = 'Este produto só aceita quantidade inteira.'
    else if (resultado !== null && resultado < 0) er.quantidade = 'O estoque não pode ficar negativo.'
    if (motivo === 'outro' && texto.trim().length < 3) er.motivo_texto = 'Descreva o motivo.'
    setErros(er)
    if (Object.keys(er).length || !produto) return
    setEnviando(true)
    try {
      await api.post('/estoque/ajustes', { produto_id: produto.id, operacao, quantidade: n, motivo, motivo_texto: texto.trim() || undefined })
      sucesso(`Estoque de ${produto.nome} ajustado.`)
      qc.invalidateQueries({ queryKey: ['estoque'] })
      qc.invalidateQueries({ queryKey: ['produtos'] })
      aoFechar()
    } catch (er2) {
      setErros(er2 instanceof ErroApi && er2.campos ? er2.campos : { quantidade: mensagemErro(er2) })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Ajustar estoque" descricao="Use para perdas, vencidos, correções e bonificações." largura="md">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        {produto ? (
          <div className="flex items-center justify-between rounded-2xl bg-superficie-2 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-texto">{produto.nome}</p>
              <p className="tabular text-xs text-texto-3">Estoque atual: {quantidade(produto.estoque_atual, produto.unidade)} {produto.unidade}</p>
            </div>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setProduto(null)}>Trocar</Botao>
          </div>
        ) : (
          <BuscaProduto
            rotulo="Produto"
            autoFocus
            erro={erros.produto}
            filtrar={(p) => p.controla_estoque}
            aoEscolher={(p) => setProduto({ id: p.id, nome: p.nome, unidade: p.unidade, estoque_atual: p.estoque_atual, fracionavel: p.fracionavel })}
          />
        )}
        <Segmentado
          valor={operacao}
          aoMudar={setOperacao}
          opcoes={[
            { valor: 'definir', rotulo: 'A quantidade certa é' },
            { valor: 'adicionar', rotulo: 'Adicionar' },
            { valor: 'retirar', rotulo: 'Retirar' },
          ]}
        />
        <div className="grid grid-cols-2 gap-4">
          <CampoTexto rotulo="Quantidade" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value.replace(/[^\d,]/g, ''))} erro={erros.quantidade} data-autofoco={produtoInicial ? true : undefined} />
          <CampoTexto rotulo="Fica com" disabled value={resultado === null || qtd === '' ? '—' : `${quantidade(resultado, produto?.unidade)} ${produto?.unidade ?? ''}`} />
        </div>
        <Selecao rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
          {Object.entries(NOMES_MOTIVO_AJUSTE).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Selecao>
        {motivo === 'outro' && <AreaTexto rotulo="Descreva o motivo" obrigatorio rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} erro={erros.motivo_texto} />}
        <div className="flex justify-end gap-2.5">
          <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
          <Botao type="submit" carregando={enviando}>Salvar ajuste</Botao>
        </div>
      </form>
    </Modal>
  )
}
