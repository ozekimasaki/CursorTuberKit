import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles/tokens.css"
import "./styles/base.css"
import "./styles/avatar.css"
import "./styles/operator.css"
import "./styles/settings-modal.css"
import "./styles/stage-view.css"
import "./styles/panels.css"

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
