import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Les polices du premier affichage (le texte du bureau, le titre en pixels) sont demandées dès le départ, en même temps que
// le script : sans cela le navigateur ne les découvre qu'après avoir lu le CSS, et la barre du haut change de taille quand elles arrivent.
const FIRST_FONTS = /(plus-jakarta-sans-latin-wght|pixelify-sans-latin-(500|700))-normal-.*\.woff2$/;
function preloadFonts(): Plugin {
  return {
    name: 'bureau-preload-fonts',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const files = Object.keys(ctx.bundle ?? {}).filter((f) => FIRST_FONTS.test(f));
        return files.map((f) => ({ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${f}`, crossorigin: '' }, injectTo: 'head' as const }));
      },
    },
  };
}

// En développement, Vite sert le bureau (port 5174) et passe la connexion /ws au pont (port 4848).
export default defineConfig({
  plugins: [react(), preloadFonts()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: { '/ws': { target: 'ws://127.0.0.1:4848', ws: true }, '/apercu': { target: 'http://127.0.0.1:4848' } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
});
