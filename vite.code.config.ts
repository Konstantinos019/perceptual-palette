import { defineConfig } from 'vite';

export default defineConfig({
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
