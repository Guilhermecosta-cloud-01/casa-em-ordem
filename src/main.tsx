import '@fontsource-variable/atkinson-hyperlegible-next/wght.css'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './pwa/install'
import { App } from './app/App'
import { toastFromOutside } from './components/ui/Toast'
import { loadOutbox } from './lib/sync/outbox'
import { supabase } from './lib/supabase'
import { setupShoppingSync } from './modules/shopping/offline'

// A fila de sincronização é configurada antes de qualquer tela, para que
// alterações guardadas offline sejam reenviadas assim que possível.
setupShoppingSync({
  refreshAuth: async () => {
    const { data, error } = await supabase.auth.refreshSession()
    return !error && Boolean(data.session)
  },
  onFailure: (message) => toastFromOutside()?.error(message),
})
void loadOutbox()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
