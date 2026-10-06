import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [viteSingleFile(), {
    name: 'websim-theme-snapshot',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.html')) continue;
        // Keep a self-contained fallback, but let the site disable its shared
        // theme when the latest stylesheet is available. Lab-specific CSS stays.
        asset.source = String(asset.source).replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (tag, css: string) => {
          const localStart = css.indexOf('#dla-app');
          if (localStart < 0 || !css.slice(0, localStart).includes('.lab-topbar')) return tag;
          return `<style data-websim-theme-snapshot>${css.slice(0, localStart)}</style><style>${css.slice(localStart)}</style>`;
        });
      }
    }
  }],
  test: {
    environment: 'node'
  }
})
