#!/usr/bin/env node
/* Baut die *.test.ts unter src/ zu eigenstaendigen ESM-Dateien in dist-test/,
 * damit `node --test` sie ohne TypeScript-Laufzeit ausfuehren kann.
 *
 * Jede Testdatei wird gebuendelt (bundle: true), damit relative Importe und
 * Dateiendungen keine Rolle spielen. Der Alias biegt Importe von 'cockpit' auf
 * ein Test-Double um; Module, die cockpit gar nicht importieren, sind davon
 * nicht betroffen.
 */
import { build } from 'esbuild';
import { globSync } from 'glob';

const entryPoints = globSync('src/**/*.test.ts');

if (entryPoints.length === 0) {
    console.error('Keine Testdateien gefunden (src/**/*.test.ts)');
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

console.log(`${entryPoints.length} Testdatei(en) nach dist-test/ gebaut`);
