import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),

    VitePWA({
      registerType: 'autoUpdate',

      manifest: {
        name: 'App',
        short_name: 'App',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone'
      }
    })
  ]
})
