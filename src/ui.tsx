import React from "react";
import { createRoot } from "react-dom/client";

import { Application } from "./ui/Application";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(<Application />);
