import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { loadAppConfig } from "./config/load-config.mjs"

const backendPort = loadAppConfig().server.port
const reactPackageRoot = fileURLToPath(new URL("./node_modules/react", import.meta.url))
const reactDomPackageRoot = fileURLToPath(new URL("./node_modules/react-dom", import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: reactPackageRoot,
      "react-dom": reactDomPackageRoot,
    },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: "dist/client",
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || /[\\/]react[\\/]/.test(id)) return "react"
          }
          return undefined
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
  clearScreen: false,
})
