import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const backendPort = Number(process.env.PORT ?? 8787)

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("lucide-react")) return "icons"
            if (id.includes("react-dom") || /[\\/]react[\\/]/.test(id)) return "react"
          }
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
