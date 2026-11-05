import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/googleMock' // dev-only Google stand-in, when VITE_GOOGLE_MOCK=1
import App from './App'
import { WORKSPACE_EVENT } from './lib/workspaces'
import { resetCalendarEvents } from './lib/gcalEvents'
import './index.css'
import './select.css'
import './lib/selects'
import './lib/pwa'

// Switching workspace starts the app again (lib/workspaces.js reopenPlanner): a new key draws it afresh.
function Root() {
  const [run, setRun] = React.useState(0)
  React.useEffect(() => {
    const again = () => { resetCalendarEvents(); window.scrollTo(0, 0); setRun((n) => n + 1) }
    window.addEventListener(WORKSPACE_EVENT, again)
    return () => window.removeEventListener(WORKSPACE_EVENT, again)
  }, [])
  return <App key={run} />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
