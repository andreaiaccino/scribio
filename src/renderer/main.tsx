import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/global.css'
import App from './App'

const root = document.getElementById('root')
if (!root) throw new Error('#root non trovato')

createRoot(root).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
