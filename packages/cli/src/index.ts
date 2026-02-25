#!/usr/bin/env node

import { createNodeServer, defaultConfig, prefixedLogger, basicLogger } from '@ok200/engine'
import * as path from 'path'

function parseArgs(args: string[]): {
  root: string
  port: number
  host: string
  cors: boolean
  spa: boolean
  noListing: boolean
  quiet: boolean
} {
  let root = '.'
  let port = 8080
  let host = '127.0.0.1'
  let cors = false
  let spa = false
  let noListing = false
  let quiet = false

  let i = 0
  while (i < args.length) {
    const arg = args[i]
    if (arg === '--port' || arg === '-p') {
      port = parseInt(args[++i], 10)
      if (isNaN(port)) {
        console.error('Invalid port number')
        process.exit(1)
      }
    } else if (arg === '--host' || arg === '-H') {
      host = args[++i]
    } else if (arg === '--cors') {
      cors = true
    } else if (arg === '--spa') {
      spa = true
    } else if (arg === '--no-listing') {
      noListing = true
    } else if (arg === '--quiet' || arg === '-q') {
      quiet = true
    } else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    } else if (!arg.startsWith('-')) {
      root = arg
    } else {
      console.error(`Unknown option: ${arg}`)
      printHelp()
      process.exit(1)
    }
    i++
  }

  return { root, port, host, cors, spa, noListing, quiet }
}

function printHelp(): void {
  console.log(`
ok200 - serve static files

Usage: ok200 [directory] [options]

Options:
  --port, -p <port>    Port to listen on (default: 8080)
  --host, -H <host>    Host to bind (default: 127.0.0.1)
  --cors               Enable CORS headers
  --spa                SPA mode: serve index.html for missing paths
  --no-listing         Disable directory listing
  --quiet, -q          Suppress request logging
  --help, -h           Show this help
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const root = path.resolve(args.root)

  const config = {
    ...defaultConfig(root),
    port: args.port,
    host: args.host,
    cors: args.cors,
    spa: args.spa,
    directoryListing: !args.noListing,
    quiet: args.quiet,
  }

  const logger = args.quiet
    ? { debug: () => {}, info: () => {}, warn: console.warn, error: console.error }
    : prefixedLogger('ok200', basicLogger())

  const server = createNodeServer({ config, logger })

  const port = await server.start()

  const url = `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${port}`
  console.log(`\n  ok200 serving ${root}\n`)
  console.log(`  Local:   ${url}`)
  if (config.host === '0.0.0.0') {
    console.log(`  Network: http://0.0.0.0:${port}`)
  }
  console.log()

  const shutdown = async () => {
    console.log('\nShutting down...')
    await server.stop()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
