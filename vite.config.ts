import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
  const realtimeOrigin = supabaseOrigin?.replace(/^https:/, 'wss:');

  return {
    base: '/colafig/',
    plugins: [
      react(),
      {
        name: 'production-content-security-policy',
        transformIndexHtml: command === 'build' ? () => securityPolicyTag(supabaseOrigin, realtimeOrigin) : undefined,
      },
    ],
  };
});

function securityPolicyTag(supabaseOrigin: string | null, realtimeOrigin: string | null) {
  const connections = ["'self'", supabaseOrigin, realtimeOrigin].filter(Boolean).join(' ');

  return [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: [
          "default-src 'self'",
          "base-uri 'self'",
          "object-src 'none'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data:",
          `connect-src ${connections}`,
          "manifest-src 'self'",
          "worker-src 'self'",
          "form-action 'self'",
        ].join('; '),
      },
      injectTo: 'head-prepend' as const,
    },
  ];
}
