import { defineConfig } from 'vitest/config';

// Integration tests start an in-memory MongoDB (downloaded once), so allow generous time.
export default defineConfig({ test: { testTimeout: 30000, hookTimeout: 180000 } });
