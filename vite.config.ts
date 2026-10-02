import { rmSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import pkg from './package.json'

export default defineConfig(({ command }) => {
  rmSync(path.join(__dirname, 'dist-electron'), { recursive: true, force: true })

  const isServe = command === 'serve'
  const isBuild = command === 'build'
  const sourcemap = isServe

  return {
    resolve: {
      alias: {
        '@': path.join(__dirname, 'src/renderer/src')
      }
    },
    plugins: [
      react(),
      electron([
        {
          entry: path.join(__dirname, 'src/main/index.ts'),
          onstart(args) {
            args.startup()
          },
          vite: {
            build: {
              sourcemap,
              minify: isBuild,
              outDir: path.join(__dirname, 'dist-electron/main'),
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {})
              }
            }
          }
        },
        {
          entry: path.join(__dirname, 'src/preload/index.ts'),
          onstart(args) {
            args.reload()
          },
          vite: {
            build: {
              sourcemap: sourcemap ? 'inline' : undefined,
              minify: isBuild,
              outDir: path.join(__dirname, 'dist-electron/preload'),
              rollupOptions: {
                external: Object.keys('dependencies' in pkg ? (pkg.dependencies as Record<string, string>) : {}),
                output: {
                  format: 'cjs',
                  inlineDynamicImports: true,
                  entryFileNames: '[name].js',
                  chunkFileNames: '[name].js',
                  assetFileNames: '[name].[ext]'
                }
              }
            }
          }
        }
      ]),
      renderer()
    ],
    root: 'src/renderer',
    build: {
      outDir: path.join(__dirname, 'dist'),
      emptyOutDir: true
    },
    clearScreen: false
  }
})
