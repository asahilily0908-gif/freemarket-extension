import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

function copyManifestPlugin() {
  return {
    name: "copy-manifest",
    closeBundle() {
      // manifest.json をコピー
      copyFileSync(
        resolve(__dirname, "extension/manifest.json"),
        resolve(__dirname, "extension/dist/manifest.json")
      );
      // icons ディレクトリをコピー（存在する場合）
      const iconsDir = resolve(__dirname, "extension/icons");
      const distIconsDir = resolve(__dirname, "extension/dist/icons");
      if (existsSync(iconsDir)) {
        mkdirSync(distIconsDir, { recursive: true });
        for (const file of ["icon16.png", "icon48.png", "icon128.png"]) {
          const src = resolve(iconsDir, file);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distIconsDir, file));
          }
        }
      }
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), copyManifestPlugin()],
  build: {
    outDir: "extension/dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "extension/popup/index.html"),
        "service-worker": resolve(
          __dirname,
          "extension/background/service-worker.ts"
        ),
        mercari: resolve(__dirname, "extension/content/mercari.ts"),
        rakuma: resolve(__dirname, "extension/content/rakuma.ts"),
        yahooflea: resolve(__dirname, "extension/content/yahooflea.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
