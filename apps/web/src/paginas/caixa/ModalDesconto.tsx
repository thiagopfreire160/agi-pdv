import { useEffect, useState } from 'react'
import { Modal } from '../../componentes/ui/Modal'
import { Botao } from '../../componentes/ui/Botao'
import { CampoDinheiro, CampoTexto, Segmentado } from '../../componentes/ui/Campo'
import { dinheiro, percentual } from '../../utils/formatos'
import { arred } from './vendaLocal'

export interface AlvoDesconto {
  tipo: 'item' | 'venda'
  descricao: string
  /** Valor sobre o qual o desconto incide (bruto do item ou subtotal da venda). */
  base: number
  atual: number
}

/** Desconto em R$ ou % (F6): no item selecionado ou na venda. */
export function ModalDesconto({ alvo, limite, aoFechar, aoAplicar }: { alvo: AlvoDesconto | null; limite: number; aoFechar: () => void; aoAplicar: (centavos: number) => void }) {
  const [modo, setModo] = useState<'pct' | 'rs'>('pct')
  const [pct, setPct] = useState('')
  const [rs, setRs] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (alvo) {
      setModo('pct')
      setPct('')
      setRs(alvo.atual)
      setErro(null)
    }
  }, [alvo])

  if (!alvo) return null
  const pctNum = parseFloat(pct.replace(',', '.')) || 0
  const valor = modo === 'pct' ? arred((alvo.base * pctNum) / 100) : rs
  const max = alvo.base - 1

  function aplicar(e: React.FormEvent) {
    e.preventDefault()
    if (!alvo) return
    if (valor < 0 || (modo === 'pct' && (pctNum < 0 || pctNum >= 100))) {
      setErro('Informe um percentual entre 0 e 99,99.')
      return
    }
    if (valor > max) {
      setErro(`O desconto precisa ser menor que ${dinheiro(alvo.base)}.`)
      return
    }
    aoAplicar(valor)
  }

  return (
    <Modal aberto={!!alvo} aoFechar={aoFechar} titulo={alvo.tipo === 'item' ? 'Desconto no item' : 'Desconto na venda'} descricao={alvo.descricao} largura="sm">
      <form onSubmit={aplicar} className="flex flex-col gap-4">
        <Segmentado valor={modo} aoMudar={(m) => { setModo(m); setErro(null) }} opcoes={[{ valor: 'pct', rotulo: 'Em %' }, { valor: 'rs', rotulo: 'Em R$' }]} />
        {modo === 'pct' ? (
          <CampoTexto
            rotulo="Percentual"
            data-autofoco
            inputMode="decimal"
            value={pct}
            onChange={(e) => setPct(e.target.value.replace(/[^\d,]/g, ''))}
            sufixo={<span className="pr-2 text-sm font-semibold text-texto-3">%</span>}
            erro={erro}
          />
        ) : (
          <CampoDinheiro rotulo="Valor do desconto" data-autofoco valor={rs} aoMudar={setRs} erro={erro} />
        )}
        <div className="rounded-2xl bg-superficie-2 p-4 text-sm">
          <div className="flex justify-between text-texto-2">
            <span>Valor</span>
            <span className="tabular">{dinheiro(alvo.base)}</span>
          </div>
          <div className="flex justify-between text-texto-2">
            <span>Desconto</span>
            <span className="tabular">− {dinheiro(Math.max(0, valor))}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-borda pt-1 font-bold text-texto">
            <span>Fica</span>
            <span className="tabular">{dinheiro(Math.max(0, alvo.base - valor))}</span>
          </div>
        </div>
        <p className="text-xs text-texto-3">Seu limite é {percentual(limite, 2)} do valor da venda. Acima disso, um gerente precisa autorizar.</p>
        <div className="flex justify-end gap-2.5">
          <Botao variante="fantasma" onClick={aoFechar}>Voltar</Botao>
          <Botao type="submit">Aplicar desconto</Botao>
        </div>
      </form>
    </Modal>
  )
}
