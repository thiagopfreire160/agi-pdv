/** Logo agi pdv: símbolo dourado + nome ("agi" 800, "pdv" 300 em dourado). */
export function Logo({ tamanho = 36, mostrarNome = true, sempreEscuro = false }: { tamanho?: number; mostrarNome?: boolean; sempreEscuro?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src="/marca/agi-simbolo.png" width={tamanho} height={tamanho} alt={mostrarNome ? '' : 'agi pdv'} className="shrink-0" />
      {mostrarNome && (
        <span className="font-titulo text-[21px] leading-none tracking-[-0.035em]" aria-label="agi pdv">
          <span className={`font-extrabold ${sempreEscuro ? 'text-creme' : 'text-texto'}`}>agi</span>{' '}
          <span className={`font-light ${sempreEscuro ? 'text-ouro' : 'text-destaque'}`}>pdv</span>
        </span>
      )}
    </span>
  )
}
