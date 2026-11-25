import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const configure = async server => {
    const env = loadEnv(mode, process.cwd(), ['DOUBAO_', 'REQUESTY_', 'CLOUDBASE_']);
    // Load the Node handler at runtime. Vite only bundles the browser application.
    const { notebookHandler } = await import(pathToFileURL(resolve('api/notebook.js')).href);
    server.middlewares.use('/api/notebook', notebookHandler(env.REQUESTY_API_KEY, 120000, env));
  };
  return {
    plugins: [{ name: 'notebook-api', configureServer: configure, configurePreviewServer: configure }],
    server: { watch: { ignored: ['**/docs/**', '**/scripts/**', '**/tests/**'] } },
  };
});
