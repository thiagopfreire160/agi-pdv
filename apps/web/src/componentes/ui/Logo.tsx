import { useTema } from '../../ganchos/useTema'

/** Logo NEXO PDV: ícone claro/escuro conforme o tema + nome ("NEXO" 800, "PDV" 500). */
export function Logo({ tamanho = 36, mostrarNome = true, sempreEscuro = false }: { tamanho?: number; mostrarNome?: boolean; sempreEscuro?: boolean }) {
  const { escuro } = useTema()
  const usarEscuro = sempreEscuro || escuro
  return (
    <span className="inline-flex items-center gap-2.5">
      <img
        src={usarEscuro ? '/marca/nexo-logo-escuro.png' : '/marca/nexo-logo-claro.png'}
        width={tamanho}
        height={tamanho}
        alt={mostrarNome ? '' : 'NEXO PDV'}
        className="shrink-0"
      />
      {mostrarNome && (
        <span className="text-[19px] leading-none tracking-tight" aria-label="NEXO PDV">
          <span className={`font-extrabold ${sempreEscuro ? 'text-white' : 'text-texto'}`}>NEXO</span>{' '}
          <span className={`font-medium ${sempreEscuro ? 'text-white/60' : 'text-texto-3'}`}>PDV</span>
        </span>
      )}
    </span>
  )
}
