import type { NextConfig } from 'next';
import path from 'node:path';
const config: NextConfig = { poweredByHeader: false, outputFileTracingRoot: path.resolve(process.cwd()), experimental: { cpus: 1, webpackBuildWorker: false } };
export default config;
