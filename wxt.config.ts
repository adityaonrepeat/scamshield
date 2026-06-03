import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'ScamShield',
    description: 'Detects phishing and scam websites using on-device ML inference.',
    permissions: ['storage', 'tabs'],
    web_accessible_resources: [
      {
        resources: ['model/*', 'icon/*'],
        matches: ['<all_urls>'],
      },
    ],
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
});
