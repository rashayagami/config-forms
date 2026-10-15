// Concatenates every .css file under <src> (sorted, tokens first) into <out>/styles.css.
// tsc does not copy CSS, and one stylesheet keeps the consumer's import predictable.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [srcDir, outDir, coreEntry] = process.argv.slice(2);
if (!srcDir || !outDir) {
  console.error('usage: copy-css.mjs <src> <out> [core entry for generated layout CSS]');
  process.exit(1);
}

function collect(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collect(path);
    return path.endsWith('.css') ? [path] : [];
  });
}

const files = collect(srcDir).sort((a, b) => {
  const rank = (p) => (p.includes('tokens') ? 0 : 1);
  return rank(a) - rank(b) || a.localeCompare(b);
});
let css = files
  .map((file) => `/* ${relative(srcDir, file)} */\n${readFileSync(file, 'utf8').trim()}\n`)
  .join('\n');
if (coreEntry) {
  // The breakpoint rules come from layoutCss() so the stylesheet and custom breakpoints share one source.
  const { layoutCss } = await import(pathToFileURL(resolve(coreEntry)).href);
  css += `\n/* layout (generated) */\n${layoutCss()}\n`;
}
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'styles.css'), css);
console.log(`styles.css: ${files.length} files, ${css.length} bytes`);
