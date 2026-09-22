import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { scrubAuthFragment } from '@/lib/supabase/client'
import { initTheme } from '@/lib/theme'
import '@/index.css'

// Clear any auth tokens left in the URL fragment before the router reads it —
// HashRouter would otherwise try to route on `#access_token=...`.
scrubAuthFragment()
initTheme()

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
