import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";
import "./i18n/config";

// Root boundary: a failing server call (e.g. an edge function rejecting an
// expired session) must show a recovery screen, never a blank page.
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary label="App">
    <App />
  </ErrorBoundary>
);
