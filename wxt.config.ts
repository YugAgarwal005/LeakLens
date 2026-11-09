import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config for full config options
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // LeakLens collects no data — suppress the Firefox AMO data-collection notice
  suppressWarnings: { firefoxDataCollection: true },
  manifest: ({ browser }) => ({
    name: 'LeakLens',
    short_name: 'LeakLens',
    description:
      'Privacy-first, real-time sensitive data protection. Detects and warns before you accidentally expose sensitive information.',
    version: '0.1.0',
    permissions: ['storage', 'activeTab', 'tabs', 'scripting', 'alarms'],
    // <all_urls> is declared as optional and requested during onboarding
    optional_host_permissions: ['<all_urls>'],
    content_security_policy: {
      extension_pages: "script-src 'self'; object-src 'none'; connect-src 'none';",
    },
    icons: {
      '16': 'icons/icon-16.png',
      '32': 'icons/icon-32.png',
      '48': 'icons/icon-48.png',
      '128': 'icons/icon-128.png',
    },
    action: {
      default_icon: {
        '16': 'icons/icon-16.png',
        '32': 'icons/icon-32.png',
        '48': 'icons/icon-48.png',
        '128': 'icons/icon-128.png',
      },
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    web_accessible_resources:
      browser === 'firefox'
        ? ['warning.html', 'chunks/*', 'assets/*']
        : [
            {
              resources: ['warning.html', 'chunks/*', 'assets/*'],
              matches: ['<all_urls>'],
            },
          ],
    // Firefox requires a unique extension ID in browser_specific_settings
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'leaklens@leaklens.io',
              strict_min_version: '115.0',
            },
          },
        }
      : {}),
  }),
});
