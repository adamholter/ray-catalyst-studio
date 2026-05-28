import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.CATALYST_API_PORT || "5191";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`
    }
  },
  preview: {
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`
    }
  }
});
