/**
 * Applies the file:// URL fix to expo-asset so getFilename() doesn't throw
 * "Invalid base URL: https://e" on React Native. Run after npm install (see postinstall).
 */
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const buildFile = path.join(root, 'node_modules', 'expo-asset', 'build', 'AssetUris.js');
const srcFile = path.join(root, 'node_modules', 'expo-asset', 'src', 'AssetUris.ts');

const buildOld = "    const { pathname, searchParams } = new URL(url, 'https://e');";
const buildNew = `    // Avoid new URL() for file:// on React Native (Invalid base URL with 'https://e')
    if (url.startsWith('file://')) {
        const pathPart = url.indexOf('?') >= 0 ? url.slice(7, url.indexOf('?')) : url.slice(7);
        return getBasename(pathPart);
    }
    const { pathname, searchParams } = new URL(url, 'https://expo.dev/');`;

const srcOld = "const { pathname, searchParams } = new URL(url, 'https://e');";
const srcNew = `  // Avoid new URL() for file:// on React Native (Invalid base URL with 'https://e')
  if (url.startsWith('file://')) {
    const pathPart = url.indexOf('?') >= 0 ? url.slice(7, url.indexOf('?')) : url.slice(7);
    return getBasename(pathPart);
  }
  const { pathname, searchParams } = new URL(url, 'https://expo.dev/');`;

function patchFile(filePath, oldContent, newContent) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes("url.startsWith('file://')")) return; // already patched
  if (!content.includes(oldContent)) return;
  content = content.replace(oldContent, newContent);
  fs.writeFileSync(filePath, content);
}

patchFile(buildFile, buildOld, buildNew);
patchFile(srcFile, srcOld, srcNew);
