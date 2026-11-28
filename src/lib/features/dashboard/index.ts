// Public API of the dashboard feature (09 › features/<domain>/index.ts).
// Server code lives in ./server and is imported by the route directly.
export * from './components';
export * from './types';
export { METRICS, metricHint, hideWhenZero } from './metrics';
export { buildAttentionQueue, KIND_META } from './attention';
