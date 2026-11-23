import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    proxy: { "/app-api": {target:"http://127.0.0.1:4173",changeOrigin:true}, "/toe-api": { target: "https://api-poweron.toe.com.ua", changeOrigin: true, rewrite: path => path.replace(/^\/toe-api/, "/api") } },
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
