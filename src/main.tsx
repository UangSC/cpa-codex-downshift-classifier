import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/tokens.css'
import './styles/app.css'
import { createBackend, type Snapshot } from './api'
import { mockBackend } from './api/mock'
import { armSchedule } from './store/scheduler'
import { useStore } from './store/store'

// Restore the persisted theme before the first paint to avoid a flash.
document.documentElement.dataset.theme = useStore.getState().settings.theme
document.documentElement.dataset.maskNames = useStore.getState().settings.maskNames ? 'true' : 'false'

// Load the initial snapshot through the backend seam. Today that is the simulated
// dataset; a real plugin serving the routes in `src/api/contract.ts` takes over once the
// resource page injects `window.__CPA_DOWNSHIFT__`.
const backend = createBackend()
let snapshot: Snapshot
try {
  snapshot = await backend.loadSnapshot()
} catch (error) {
  console.error('后端快照加载失败，已回退到模拟数据：', error)
  snapshot = await mockBackend.loadSnapshot()
}

useStore.getState().hydrate(snapshot)

// Resume a persisted schedule (default: disabled, so this is a no-op on a fresh install).
armSchedule()

const root = document.getElementById('root')
if (!root) throw new Error('#root not found')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
