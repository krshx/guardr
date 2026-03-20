/**
 * Guardr Build Script with Version Management
 * Bundles src/ ES6 modules into a single content-v3.js for Chrome Extension
 * Handles version incrementing: minor (3.1.0), patch (3.1.101)
 *
 * Usage:
 *   node build.js [--minor|--patch|--watch]
 *   npm run build [-- --minor|--patch]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'src');
const OUTPUT_FILE = path.join(__dirname, 'content-v3.js');
const MANIFEST_FILE = path.join(__dirname, 'manifest.json');
const PACKAGE_FILE = path.join(__dirname, 'package.json');
const VERSION_FILE = path.join(__dirname, '.version.json');

// Module load order — dependencies must come before dependents
const MODULE_ORDER = [
  'constants.js',
  'utils.js',
  'state-machine.js',
  'detector.js',
  'analyzer.js',
  'actor.js',
  'learning.js',
  'index.js'
];

// =============================================================================
// LOGGING
// =============================================================================

function log(msg) {
  console.log(`[BUILD] ${msg}`);
}

// =============================================================================
// VERSION MANAGEMENT
// =============================================================================

function getVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
  return pkg.version;
}

function setVersion(version) {
  // Update package.json
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_FILE, 'utf8'));
  pkg.version = version;
  fs.writeFileSync(PACKAGE_FILE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // Update manifest.json
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  // Update .version.json
  const versionData = { version, updatedAt: new Date().toISOString() };
  fs.writeFileSync(VERSION_FILE, JSON.stringify(versionData, null, 2) + '\n', 'utf8');
}

function incrementVersion(type) {
  const current = getVersion();
  const parts = current.split('.').map(Number);

  if (type === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else if (type === 'patch') {
    parts[2] += 1;
  } else {
    throw new Error(`Unknown version type: ${type}`);
  }

  const next = parts.join('.');
  setVersion(next);
  log(`✓ Version updated to ${next}`);
  return next;
}

// =============================================================================
// MODULE READER
// =============================================================================

function readModule(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Module not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

// =============================================================================
// TRANSFORM: ES6 imports/exports → __modules pattern
// =============================================================================

/**
 * Parse all ES6 import statements from source (before stripping).
 * Returns an array of { names: string[], moduleKey: string } objects.
 * Handles both single-line and multi-line import blocks.
 */
function parseImports(source) {
  const imports = [];
  // Normalise line endings then collapse multi-line imports to single lines
  const flat = source.replace(/\r\n/g, '\n');
  // Match: import { ... } from './foo.js'  (possibly spanning multiple lines)
  const importRe = /import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = importRe.exec(flat)) !== null) {
    const names = m[1]
      .split(',')
      .map(s => s.trim().replace(/\s+as\s+\S+/, '').trim()) // drop `foo as bar` aliases
      .filter(Boolean);
    const specifier = m[2]; // e.g. './constants.js'
    // Derive the __modules key from the specifier filename (no ext, no path)
    const moduleKey = path.basename(specifier, '.js');
    imports.push({ names, moduleKey });
  }
  return imports;
}

/**
 * Transform a module's source code for IIFE bundling:
 * 1. Parse imports → emit `const { X, Y } = __modules['key'];` injections
 * 2. Strip all ES6 import statements (single- and multi-line)
 * 3. Strip `export` keyword from declarations
 * 4. Collect exported names → append `return { ... }` at the end
 */
function transformModule(source, moduleName) {
  // ── 1. Parse imports BEFORE stripping them ─────────────────────────────────
  const parsedImports = parseImports(source);

  // Build __modules injection lines
  const injections = parsedImports.map(({ names, moduleKey }) =>
    `const { ${names.join(', ')} } = __modules['${moduleKey}'];`
  );

  // ── 2. Strip all import statements (single- and multi-line) ────────────────
  // Collapse multi-line import blocks to single line first, then strip
  source = source.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/gs, '');
  // Bare side-effect imports: import './foo'
  source = source.replace(/import\s+['"][^'"]+['"]\s*;?/g, '');
  // Default imports: import Foo from './foo'
  source = source.replace(/import\s+\w+\s+from\s+['"][^'"]+['"]\s*;?/g, '');
  // Any stray `} from '...'` remnants
  source = source.replace(/^\s*\}\s*from\s*['"][^'"]+['"]\s*;?\s*$/gm, '');

  // ── 3 & 4. Process line-by-line for export handling ────────────────────────
  const lines = source.split('\n');
  const exportNames = [];
  const transformed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Safety net: skip any remaining import lines
    if (/^\s*import[\s{]/.test(line)) continue;

    // `export default` → strip keyword
    if (/^\s*export\s+default\s+/.test(line)) {
      transformed.push(line.replace(/^\s*export\s+default\s+/, ''));
      continue;
    }

    // `export class Foo` / `export function foo` / `export const foo` / `export async function`
    const namedMatch = line.match(
      /^\s*export\s+(class|function|async\s+function|const|let|var)\s+(\w+)/
    );
    if (namedMatch) {
      exportNames.push(namedMatch[2]);
      transformed.push(line.replace(/^(\s*)export\s+/, '$1'));
      continue;
    }

    // `export { foo, bar }`
    const reExportMatch = line.match(/^\s*export\s+\{([^}]+)\}/);
    if (reExportMatch) {
      reExportMatch[1].split(',').map(s => s.trim()).filter(Boolean)
        .forEach(n => exportNames.push(n));
      continue;
    }

    transformed.push(line);
  }

  // ── Assemble ────────────────────────────────────────────────────────────────
  let result = '';

  // Inject __modules lookups at the very top of the module body
  if (injections.length > 0) {
    result += injections.join('\n') + '\n\n';
  }

  result += transformed.join('\n');

  // Append return statement
  if (exportNames.length > 0) {
    result += `\n\n    return { ${exportNames.join(', ')} };\n`;
  }

  return result;
}

// =============================================================================
// BUNDLE GENERATOR
// =============================================================================

function buildModules() {
  const modules = [];

  log(`Building bundle from ${MODULE_ORDER.length} modules...`);

  for (const filename of MODULE_ORDER) {
    const filePath = path.join(SRC_DIR, filename);
    log(`  → ${filename}`);

    const rawSource = readModule(filePath);
    const transformed = transformModule(rawSource, filename);

    // Module key is filename without extension
    const key = filename.replace(/\.js$/, '');

    modules.push({ key, filename, source: transformed });
  }

  return modules;
}

function generateBundleOutput(modules) {
  const version = getVersion();

  const header = `/**
 * Guardr v${version} - Content Script Bundle
 * Auto-generated by build.js — DO NOT EDIT DIRECTLY
 * Edit source files in src/ and run: npm run build
 * Generated: ${new Date().toISOString()}
 */
`;

  // Wrapper: IIFE with __modules registry
  const iife = `(function() {
  'use strict';

  // Module registry
  const __modules = {};

${modules.map(m => `  // ─── ${m.filename} ${'─'.repeat(Math.max(0, 60 - m.filename.length))}
  __modules['${m.key}'] = (function() {
${m.source.split('\n').map(l => '    ' + l).join('\n')}
  })();
`).join('\n')}
  // Bootstrap
  if (typeof __modules['index'] !== 'undefined' && __modules['index'].init) {
    __modules['index'].init();
  }

})();
`;

  return header + iife;
}

// =============================================================================
// MAIN BUILD
// =============================================================================

function build() {
  try {
    const modules = buildModules();
    const output = generateBundleOutput(modules);

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');
    log(`✓ Bundle generated: ${OUTPUT_FILE}`);
    log(`  Size: ${(output.length / 1024).toFixed(1)} KB`);

  } catch (err) {
    console.error(`[BUILD] Error: ${err.message}`);
    process.exit(1);
  }
}

// =============================================================================
// WATCH MODE
// =============================================================================

function watch() {
  log('Watch mode enabled — watching src/ for changes...');
  build(); // Initial build

  let debounceTimer = null;
  fs.watch(SRC_DIR, { recursive: false }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.js')) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      log(`Change detected: ${filename}`);
      build();
    }, 200);
  });
}

// =============================================================================
// ENTRY POINT
// =============================================================================

const args = process.argv.slice(2);

// Handle version incrementing
if (args.includes('--minor')) {
  log(`Incrementing minor version...`);
  incrementVersion('minor');
} else if (args.includes('--patch')) {
  log(`Incrementing patch version...`);
  incrementVersion('patch');
}

// --version-only: bump version and exit without bundling.
// Used by build:minor and build:patch so esbuild can do the actual bundle.
if (args.includes('--version-only')) {
  process.exit(0);
}

if (args.includes('--watch')) {
  watch();
} else {
  build();
}
