import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  webpack(config) {
    // Allow :root selectors in CSS Modules (RecapForm.module.css uses :root for tokens)
    const findAndPatch = (rules: unknown[]) => {
      for (const rule of rules) {
        if (!rule || typeof rule !== 'object') continue;
        const r = rule as Record<string, unknown>;

        // Recurse into oneOf
        if (Array.isArray(r.oneOf)) findAndPatch(r.oneOf);

        // Patch css-loader options if found
        if (Array.isArray(r.use)) {
          for (const use of r.use) {
            if (!use || typeof use !== 'object') continue;
            const u = use as Record<string, unknown>;
            if (
              typeof u.loader === 'string' &&
              u.loader.includes('css-loader') &&
              u.options &&
              typeof u.options === 'object'
            ) {
              const opts = u.options as Record<string, unknown>;
              if (opts.modules && typeof opts.modules === 'object') {
                const mods = opts.modules as Record<string, unknown>;
                if (mods.mode === 'pure') {
                  mods.mode = 'local';
                }
              }
            }
          }
        }
      }
    };

    const rules = config.module?.rules;
    if (Array.isArray(rules)) findAndPatch(rules);

    return config;
  },
};

export default nextConfig;
