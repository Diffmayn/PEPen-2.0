const fs = require('fs');
const path = require('path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeHtmlCommentBreakers(s) {
  // Prevent accidental closing of script tags when embedding.
  return String(s).replace(/<\//g, '<\\/');
}

function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function normalizeSlashes(p) {
  return String(p).replace(/\\/g, '/');
}

function stableSort(a, b) {
  return String(a).localeCompare(String(b));
}

function inlineBuild({ buildDir, outFile }) {
  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing build index.html at ${indexPath}`);
  }

  const html = readText(indexPath);

  // Remove and inline CRA build assets.
  // NOTE: Attribute order varies (e.g. href="..." rel="stylesheet"), so we avoid brittle capture regex.
  const stylesheetLinkTagRe = /<link\b[^>]*rel=("|')stylesheet\1[^>]*>/gi;
  const anyLinkTagRe = /<link\b[^>]*>/gi;
  const scriptTagWithSrcRe = /<script\b[^>]*src=("|')([^"']+)\1[^>]*>\s*<\/script>/gi;

  // Prefer reading the actual files on disk; this also captures code-split chunks.
  const staticCssDir = path.join(buildDir, 'static', 'css');
  const staticJsDir = path.join(buildDir, 'static', 'js');

  const cssFiles = listFilesRecursive(staticCssDir)
    .filter((p) => p.toLowerCase().endsWith('.css') && !p.toLowerCase().endsWith('.css.map'))
    .sort(stableSort);

  const jsFilesAll = listFilesRecursive(staticJsDir)
    .filter((p) => p.toLowerCase().endsWith('.js') && !p.toLowerCase().endsWith('.js.map'))
    .filter((p) => !p.toLowerCase().endsWith('.license.txt'))
    .sort(stableSort);

  // Ensure main bundle runs last.
  const mainJs = jsFilesAll.filter((p) => /\/main\.[a-f0-9]+\.js$/i.test(normalizeSlashes(p)));
  const otherJs = jsFilesAll.filter((p) => !/\/main\.[a-f0-9]+\.js$/i.test(normalizeSlashes(p)));
  const jsFiles = [...otherJs, ...mainJs];

  const inlineCss = cssFiles
    .map((p) => readText(p))
    .join('\n\n');

  const inlineJsTags = jsFiles
    .map((p) => {
      const js = escapeHtmlCommentBreakers(readText(p));
      return `\n<script>\n${js}\n</script>\n`;
    })
    .join('');

  // Remove original external assets.
  // - Remove any <script src="..."> (CRA bundles)
  // - Remove stylesheet <link ...>
  // - Remove any remaining <link href="/static/..."> (icons/manifest) to avoid 404 spam
  let out = html
    .replace(scriptTagWithSrcRe, '')
    .replace(stylesheetLinkTagRe, '')
    .replace(anyLinkTagRe, (tag) => {
      const href = (tag.match(/\bhref=("|')([^"']+)\1/i) || [])[2];
      const rel = (tag.match(/\brel=("|')([^"']+)\1/i) || [])[2];
      if (href && String(href).startsWith('/static/')) return '';
      if (rel && String(rel).toLowerCase() === 'manifest') return '';
      return tag;
    });

  out = out.replace(
    /<\/head>/i,
    () => `\n<style>\n${inlineCss}\n</style>\n</head>`
  );

  out = out.replace(
    /<\/body>/i,
    () => `\n${inlineJsTags}\n</body>`
  );

  // Remove CRA noscript message: Streamlit runs with JS in iframe.
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, '');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out, 'utf8');
  return { cssCount: cssFiles.length, jsCount: jsFiles.length };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const buildDir = path.join(repoRoot, 'build');
  const outFile = path.join(repoRoot, 'streamlit_embedded_app.html');

  const result = inlineBuild({ buildDir, outFile });
  console.log(`Wrote ${outFile} (CSS: ${result.cssCount}, JS: ${result.jsCount})`);
}

main();
