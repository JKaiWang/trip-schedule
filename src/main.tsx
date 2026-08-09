import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TripSchedulePage } from './pages/TripSchedulePage.tsx'

// Single-page app: there is exactly one screen, so no router.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TripSchedulePage />
  </StrictMode>,
)
