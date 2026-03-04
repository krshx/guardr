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
 * Transform a module's source code for IIFE bundling.
 * - Removes all `import ... from '...'` statements (single- and multi-line)
 * - Removes `export` keywords from declarations
 * - Collects named exports and appends a `return { ... }` at the end
 */
function transformModule(source, moduleName) {
  // Strip ALL import statements first (handles multi-line blocks).
  // Matches: import ... from '...' or import '...' — including newlines inside.
  source = source.replace(/^import\s[\s\S]*?from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  // Also strip bare side-effect imports: import './foo'
  source = source.replace(/^import\s+['"][^'"]+['"]\s*;?\s*$/gm, '');
  // Clean up any } from '...' remnants from multi-line imports
  source = source.replace(/^[^/\n]*\}\s+from\s+['"][^'"]+['"]\s*;?\s*$/gm, '');

  const lines = source.split('\n');
  const exportNames = [];
  const transformed = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip any remaining bare import lines (safety net)
    if (/^\s*import\s+/.test(line)) {
      continue;
    }

    // `export default` → just the value
    if (/^\s*export\s+default\s+/.test(line)) {
      transformed.push(line.replace(/^\s*export\s+default\s+/, ''));
      continue;
    }

    // `export class Foo` / `export function foo` / `export const foo` / `export async function`
    const namedExportMatch = line.match(
      /^\s*export\s+(class|function|async\s+function|const|let|var)\s+(\w+)/
    );
    if (namedExportMatch) {
      const exportedName = namedExportMatch[2];
      exportNames.push(exportedName);
      // Strip the `export ` keyword
      transformed.push(line.replace(/^(\s*)export\s+/, '$1'));
      continue;
    }

    // `export { foo, bar }` re-export lines
    const reExportMatch = line.match(/^\s*export\s+\{([^}]+)\}/);
    if (reExportMatch) {
      const names = reExportMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      exportNames.push(...names);
      // Don't emit the export line itself
      continue;
    }

    transformed.push(line);
  }

  // Build return statement with all exports
  let result = transformed.join('\n');
  if (exportNames.length > 0) {
    const returnProps = exportNames.join(', ');
    result += `\n\n    return { ${returnProps} };\n`;
  }

  return result;
}

/**
 * Rewrite import statements inside a module body to use __modules lookups.
 * Called on the ALREADY-TRANSFORMED source (imports stripped) — this pass
 * instead rewrites any `const { X } = require(...)` or leftover patterns.
 *
 * Since we strip all imports in transformModule, the modules themselves must
 * reference their dependencies via destructuring from __modules at the top
 * of each module. We inject those lookups automatically here.
 */
function injectModuleDependencies(source, moduleName, allModuleNames) {
  // Find which modules are referenced via import in the ORIGINAL source
  // (already removed) and inject __modules lookups at the top.
  // We scan the original source for import ... from './foo' patterns.
  return source; // Dependencies handled by transform stripping imports; modules
                 // use __modules directly (already written that way in src/).
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

if (args.includes('--watch')) {
  watch();
} else {
  build();
}
