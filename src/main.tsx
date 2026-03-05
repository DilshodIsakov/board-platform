import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./i18n";
import App from "./App.tsx";

console.log("MAIN.TSX LOADED ✅");

interface ErrorBoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "system-ui", maxWidth: 600 }}>
          <h1 style={{ color: "#dc2626" }}>Ошибка запуска приложения</h1>
          <pre
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 16,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            Проверьте файл <code>.env</code> в корне проекта и перезапустите <code>npm run dev</code>.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
<ErrorBoundary>
  <App />
</ErrorBoundary>
);