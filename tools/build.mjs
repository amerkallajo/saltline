// Build Saltline. No dependencies. Usage:
//   node tools/build.mjs        -> dist/saltline.html (single file, what gets published) + index.html (dev, loads src/ files)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tpl = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const ph = /(<style>|<script(?: [^>]*)?>)\{\{file:([^}]+)\}\}(<\/style>|<\/script>)/g;
const localTemplate = tpl.replace(/<!-- pages-only -->[\s\S]*?<!-- \/pages-only -->\r?\n/g, '');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const inline = (template) => template.replace(ph, (_, open, file, close) => {
  const source = read(file);
  if (file !== 'node_modules/peerjs/dist/peerjs.min.js') return open + source + close;
  const license = read('node_modules/peerjs/LICENSE');
  return open + '/*!\n' + license + '\n*/\n' + source.replace(/\/\/# sourceMappingURL=[^\r\n]*\s*$/, '') + '\n' + close;
});

// 1) single-file build: inline every file exactly where its placeholder sits
const single = inline(localTemplate);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/saltline.html'), single);

// 2) dev index.html: same page but css/js are loaded from src/ (edit a file, refresh the browser)
const dev = localTemplate.replace(ph, (_, open, file) => {
  if (file.endsWith('.b64')) return ''; // legacy snapshot is only needed in the published single file
  return file.endsWith('.css') ? `<link rel="stylesheet" href="${file}">` : `<script src="${file}"></script>`;
});
fs.writeFileSync(path.join(root, 'index.html'), dev);
console.log('built dist/saltline.html (' + single.length + ' bytes) and index.html');

if (process.argv.includes('--pages')) {
  const pages = path.join(root, 'dist/pages');
  fs.mkdirSync(pages, { recursive: true });
  fs.writeFileSync(path.join(pages, 'index.html'), inline(tpl));
  console.log('built dist/pages/index.html');
}
