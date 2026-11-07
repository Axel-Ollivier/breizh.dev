import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/bingo/",
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/bingo/hub": { target: "http://127.0.0.1:5080", ws: true },
      "/bingo/api": { target: "http://127.0.0.1:5080" },
    },
  },
});
