import { defineConfig } from 'vite'

const serveLandingOnRoot = () => ({
  name: 'serve-landing-on-root',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url || '').split('?')[0]
      if (path === '/') req.url = '/unifi-landing.html'
      next()
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url || '').split('?')[0]
      if (path === '/') req.url = '/unifi-landing.html'
      next()
    })
  },
})

export default defineConfig({
  plugins: [serveLandingOnRoot()],
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  server: {
    port: 5173,
  },
})
