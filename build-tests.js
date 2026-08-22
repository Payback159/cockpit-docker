#!/usr/bin/env node
/* Builds the *.test.ts files under src/ into standalone ESM files in
 * dist-test/, so that `node --test` can run them without a TypeScript runtime.
 *
 * Every test file is bundled (bundle: true) so that relative imports and file
 * extensions do not matter. The alias redirects imports of 'cockpit' to a test
 * double; modules that do not import cockpit at all are unaffected.
 */
import { build } from 'esbuild';
import { globSync } from 'glob';

const entryPoints = globSync('src/**/*.test.ts');

if (entryPoints.length === 0) {
    console.error('No test files found (src/**/*.test.ts)');
    process.exit(1);
}

await build({
    entryPoints,
    outdir: 'dist-test',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'warning',
    alias: {
        cockpit: './src/client/test-support/cockpit-mock.ts',
    },
});

console.log(`Built ${entryPoints.length} test file(s) into dist-test/`);
