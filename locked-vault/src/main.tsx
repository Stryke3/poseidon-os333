import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import DigitalVault from "./DigitalVault";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DigitalVault />
  </React.StrictMode>,
);
