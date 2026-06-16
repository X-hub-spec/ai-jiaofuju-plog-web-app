import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/ai-jiaofuju-plog-web-app/",
  plugins: [react()],
  server: {
    port: 5177,
    strictPort: false
  }
});
