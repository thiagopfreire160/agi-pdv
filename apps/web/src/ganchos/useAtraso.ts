import { useEffect, useState } from 'react'

/** Devolve o valor só depois de `ms` sem mudanças (para buscas). */
export function useAtraso<T>(valor: T, ms = 300): T {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}
