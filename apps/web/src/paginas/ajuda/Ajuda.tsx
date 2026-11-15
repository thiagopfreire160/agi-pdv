import { Link } from 'react-router'
import { ArrowLeftRight, Banknote, Lock, LockOpen, PackagePlus, ScanLine } from 'lucide-react'
import { CabecalhoPagina } from '../../componentes/ui/Pagina'
import { Card, CabecalhoCard } from '../../componentes/ui/Card'
import { Atalho } from '../../componentes/ui/Estados'

const ATALHOS: [string, string][] = [
  ['F2', 'Buscar produto pelo nome'],
  ['F3', 'Identificar o cliente'],
  ['F4', 'Receber e finalizar a venda'],
  ['F6', 'Dar desconto'],
  ['F8', 'Remover o item escolhido'],
  ['F9', 'Sangria ou suprimento'],
  ['Esc', 'Fechar a janela aberta'],
  ['↑ ↓', 'Escolher item da venda'],
  ['+ −', 'Somar ou tirar 1 do item'],
  ['1 a 5', 'Forma de pagamento: dinheiro, débito, crédito, PIX ou vale-troca'],
]

const PASSOS = [
  { icone: LockOpen, titulo: 'Abra o caixa', texto: 'Em Caixa, conte o dinheiro da gaveta e informe o fundo de troco.' },
  { icone: ScanLine, titulo: 'Passe os produtos', texto: 'Leia o código de barras. Para 3 unidades, digite 3*código e Enter.' },
  { icone: Banknote, titulo: 'Receba', texto: 'Tecle F4, escolha a forma (1 a 5) e Enter. Para dividir, adicione uma forma de cada vez.' },
  { icone: ArrowLeftRight, titulo: 'Troca', texto: 'Em Trocas, devolva o produto com vale-troca. Na nova venda, use o vale no caixa.' },
  { icone: PackagePlus, titulo: 'Chegou mercadoria', texto: 'Em Estoque, registre a entrada para somar ao estoque.' },
  { icone: Lock, titulo: 'Feche o caixa', texto: 'No fim do dia, conte o dinheiro e informe o total. Depois o sistema mostra se sobrou ou faltou.' },
]

export function Ajuda() {
  return (
    <div>
      <CabecalhoPagina titulo="Ajuda" descricao="O básico para usar o NEXO PDV no dia a dia." />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px] xl:gap-5">
        <Card>
          <CabecalhoCard titulo="Passo a passo do dia" />
          <ol className="grid gap-3 sm:grid-cols-2">
            {PASSOS.map(({ icone: I, titulo, texto }, n) => (
              <li key={titulo} className="flex gap-4 rounded-2xl bg-superficie-2 p-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primaria text-sobre-primaria">
                  <I size={20} strokeWidth={1.75} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-texto">
                    {n + 1}. {titulo}
                  </span>
                  <span className="text-sm text-texto-2">{texto}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <CabecalhoCard titulo="Atalhos do caixa" descricao="Dá para vender sem tocar no mouse." />
          <ul className="flex flex-col gap-2.5">
            {ATALHOS.map(([t, d]) => (
              <li key={t} className="flex items-center gap-3">
                <span className="w-16 shrink-0">
                  <Atalho tecla={t} />
                </span>
                <span className="text-sm text-texto-2">{d}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="xl:col-span-2">
          <CabecalhoCard titulo="Dúvidas comuns" />
          <dl className="grid gap-5 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-texto">Esqueci a senha.</dt>
              <dd className="mt-1 text-texto-2">Peça ao administrador ou gerente para gerar uma senha temporária em Usuários.</dd>
            </div>
            <div>
              <dt className="font-semibold text-texto">O desconto pediu autorização.</dt>
              <dd className="mt-1 text-texto-2">Passou do seu limite. Um gerente digita o e-mail e a senha dele na janela que abriu.</dd>
            </div>
            <div>
              <dt className="font-semibold text-texto">A página recarregou no meio da venda.</dt>
              <dd className="mt-1 text-texto-2">A venda fica guardada neste computador e volta sozinha. É só continuar.</dd>
            </div>
            <div>
              <dt className="font-semibold text-texto">O recibo não é nota fiscal?</dt>
              <dd className="mt-1 text-texto-2">Não. O NEXO PDV emite comprovante não fiscal. Ajuste a impressão em <Link className="font-semibold text-primaria underline" to="/configuracoes">Configurações</Link>.</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  )
}
