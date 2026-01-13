const fs = require('fs');
const path = require('path');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function escapeHtmlCommentBreakers(s) {
  // Prevent accidental closing of script tags when embedding.
  return String(s).replace(/<\//g, '<\\/');
}

function inlineBuild({ buildDir, outFile }) {
  const indexPath = path.join(buildDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Missing build index.html at ${indexPath}`);
  }

  const html = readText(indexPath);

  // Extract stylesheet hrefs and script srcs in-order.
  // CRA build uses relative paths like /static/...
  const linkRe = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/gi;
  const scriptRe = /<script[^>]+src="([^"]+)"[^>]*><\/script>/gi;

  const cssHrefs = [];
  const jsSrcs = [];

  let m;
  while ((m = linkRe.exec(html)) !== null) cssHrefs.push(m[1]);
  while ((m = scriptRe.exec(html)) !== null) jsSrcs.push(m[1]);

  const resolveAsset = (hrefOrSrc) => {
    // build paths are rooted at build/
    const cleaned = hrefOrSrc.replace(/^\//, '');
    return path.join(buildDir, cleaned);
  };

  const inlineCss = cssHrefs
    .map((href) => {
      const p = resolveAsset(href);
      if (!fs.existsSync(p)) return `/* Missing CSS: ${href} */`;
      return readText(p);
    })
    .join('\n\n');

  const inlineJs = jsSrcs
    .map((src) => {
      const p = resolveAsset(src);
      if (!fs.existsSync(p)) return `console.warn(${JSON.stringify(`Missing JS: ${src}`)});`;
      return readText(p);
    })
    .map(escapeHtmlCommentBreakers)
    .join('\n\n');

  // Remove original stylesheet/script tags; inject inlined versions before </head> and </body>
  let out = html
    .replace(linkRe, '')
    .replace(scriptRe, '');

  out = out.replace(
    /<\/head>/i,
    `\n<style>\n${inlineCss}\n</style>\n</head>`
  );

  out = out.replace(
    /<\/body>/i,
    `\n<script>\n${inlineJs}\n</script>\n</body>`
  );

  // Remove CRA noscript message: Streamlit runs with JS in iframe.
  out = out.replace(/<noscript>[\s\S]*?<\/noscript>/i, '');

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, out, 'utf8');
  return { cssCount: cssHrefs.length, jsCount: jsSrcs.length };
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const buildDir = path.join(repoRoot, 'build');
  const outFile = path.join(repoRoot, 'streamlit_embedded_app.html');

  const result = inlineBuild({ buildDir, outFile });
  console.log(`Wrote ${outFile} (CSS: ${result.cssCount}, JS: ${result.jsCount})`);
}

main();
