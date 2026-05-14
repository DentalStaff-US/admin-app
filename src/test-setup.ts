// Loaded before every client-project test file. Registers the
// `@testing-library/jest-dom` matchers on Vitest's `expect` so we can write
// `expect(el).toBeInTheDocument()` etc.
import '@testing-library/jest-dom/vitest';
