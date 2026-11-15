import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/plus-jakarta-sans'
import './estilos/app.css'
import { App } from './App'
import { ProvedorTema } from './ganchos/useTema'
import { ProvedorSessao } from './ganchos/useSessao'
import { ProvedorAvisos } from './componentes/ui/Avisos'
import { ErroApi } from './api/cliente'

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (n, e) => !(e instanceof ErroApi && e.status >= 400 && e.status < 500) && n < 2,
    },
  },
})

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={cliente}>
      <BrowserRouter>
        <ProvedorTema>
          <ProvedorAvisos>
            <ProvedorSessao>
              <App />
            </ProvedorSessao>
          </ProvedorAvisos>
        </ProvedorTema>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
