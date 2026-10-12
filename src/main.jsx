import React from 'react'
import ReactDOM from 'react-dom/client'
import './lib/googleMock' // dev-only Google stand-in, when VITE_GOOGLE_MOCK=1
import App from './App'
import './index.css'
import './select.css'
import './lib/selects'
import './lib/pwa'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
