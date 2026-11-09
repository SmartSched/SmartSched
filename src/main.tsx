
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { startWaking } from "./app/lib/wake";

  // Wake the API server and scheduler right away; they sleep when idle and take a while to start.
  startWaking();

  createRoot(document.getElementById("root")!).render(<App />);
  