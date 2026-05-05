import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const backendPort = Number(process.env.PORT ?? 8787)

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
  },
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
})
