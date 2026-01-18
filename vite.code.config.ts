import { defineConfig } from 'vite';

export default defineConfig({
    define: {
        APP_VERSION: JSON.stringify(process.env.npm_package_version),
    },
    build: {
        target: 'es6',
        lib: {
            entry: './src/code.ts',
            name: 'code',
            formats: ['iife'],
            fileName: () => 'code.js'
        },
        outDir: 'dist',
        emptyOutDir: false,
    }
});
