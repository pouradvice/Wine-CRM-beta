import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             'Pour Advice CRM',
    short_name:       'Pour Advice',
    description:      'Wine sales relationship management',
    start_url:        '/app/crm/clients',
    display:          'standalone',
    background_color: '#fdf8f2',
    theme_color:      '#7c1d2e',
    orientation:      'portrait-primary',
    icons: [
      {
        src:   '/icon-192.png',
        sizes: '192x192',
        type:  'image/png',
      },
      {
        src:   '/icon-512.png',
        sizes: '512x512',
        type:  'image/png',
      },
    ],
  };
}
