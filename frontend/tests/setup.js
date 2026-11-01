import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => cleanup());

// jsdom has no layout engine; the pages only need these to exist.
window.scrollTo = vi.fn();
window.matchMedia = window.matchMedia || ((query) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn() }));
