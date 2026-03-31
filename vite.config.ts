import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  base: "/dnd5eminmax.github.io/",
  plugins: [solid()],
  build: {
    target: "esnext",
  },
});
