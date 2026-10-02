const { spawn } = require('child_process')
const { createServer, build } = require('vite')
const path = require('path')
const electron = require('electron')

/**
 * Dev script that:
 * 1. Builds main + preload with Vite (watch mode)
 * 2. Starts Vite dev server for renderer
 * 3. Launches Electron pointing at dev server
 */

const ROOT = path.resolve(__dirname, '..')

async function buildElectronMain() {
  return build({
    configFile: false,
    build: {
      lib: {
        entry: path.join(ROOT, 'src/main/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js'
      },
      outDir: path.join(ROOT, 'dist-electron/main'),
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      watch: {},
      rollupOptions: {
        external: [
          'electron',
          'better-sqlite3',
          ...require('module').builtinModules,
          ...require('module').builtinModules.map(m => `node:${m}`)
        ]
      }
    },
    resolve: {
      conditions: ['node'],
      mainFields: ['module', 'jsnext:main', 'jsnext']
    },
    define: {
      'process.env': 'process.env'
    }
  })
}

async function buildElectronPreload() {
  return build({
    configFile: false,
    build: {
      lib: {
        entry: path.join(ROOT, 'src/preload/index.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js'
      },
      outDir: path.join(ROOT, 'dist-electron/preload'),
      emptyOutDir: true,
      sourcemap: 'inline',
      minify: false,
      watch: {},
      rollupOptions: {
        external: [
          'electron',
          ...require('module').builtinModules,
          ...require('module').builtinModules.map(m => `node:${m}`)
        ],
        output: {
          format: 'cjs',
          inlineDynamicImports: true,
          entryFileNames: '[name].js'
        }
      }
    },
    resolve: {
      conditions: ['node'],
      mainFields: ['module', 'jsnext:main', 'jsnext']
    },
    define: {
      'process.env': 'process.env'
    }
  })
}

async function startRendererServer() {
  const server = await createServer({
    configFile: false,
    root: path.join(ROOT, 'src/renderer'),
    plugins: [(await import('@vitejs/plugin-react')).default()],
    resolve: {
      alias: {
        '@': path.join(ROOT, 'src/renderer/src')
      }
    },
    build: {
      outDir: path.join(ROOT, 'dist')
    },
    server: {
      port: 5173
    }
  })
  await server.listen()
  return server
}

let electronProcess = null

function startElectron() {
  if (electronProcess) {
    electronProcess.removeAllListeners()
    electronProcess.kill()
    electronProcess = null
  }

  electronProcess = spawn(electron, ['.', '--no-sandbox'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173/'
    }
  })

  electronProcess.on('close', (code) => {
    if (code !== null) {
      process.exit(code)
    }
  })
}

async function main() {
  console.log('[dev] Building main process...')
  const mainWatcher = await buildElectronMain()
  console.log('[dev] Building preload...')
  const preloadWatcher = await buildElectronPreload()
  console.log('[dev] Starting renderer dev server...')
  const server = await startRendererServer()

  const address = server.httpServer.address()
  console.log(`[dev] Renderer ready at http://localhost:${address.port}/`)
  console.log('[dev] Starting Electron...')

  // Small delay to ensure files are written
  setTimeout(() => {
    startElectron()
  }, 500)
}

main().catch((err) => {
  console.error('[dev] Fatal error:', err)
  process.exit(1)
})
