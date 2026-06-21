
/**
 * Advanced diagnostic parsers for PIO build output.
 *
 * Extracts warnings and errors from multiple sources:
 * - Single-line GCC/Clang (file:line:col: type: message)
 * - Linker errors (/usr/bin/ld, collect2)
 * - Python script errors (ImportError, traceback)
 * - IDF CMake errors (CMake Error at ...)
 * - Multi-line GCC notes (continuation lines)
 *
 * All parsers return the same diagnostic shape:
 *   { file, line, column, type, message, category, severity? }
 */

import path from 'path';

// Regex to make file paths relative to project root
function relativize(filePath, projectDir) {
  if (projectDir && filePath.startsWith(projectDir)) {
    return path.relative(projectDir, filePath);
  }
  return filePath;
}

// ---------------------------------------------------------------------------
// Linker errors
// ---------------------------------------------------------------------------

/**
 * Matches lines starting with `/usr/bin/ld:` or `collect2:`.
 *
 * @param {string} output
 * @param {string} [projectDir='']
 * @returns {Array<object>}
 */
export function parseLinkerErrors(output, projectDir = '') {
  const regex = /^(?:\/usr\/bin\/ld|\/.*?\/ld|collect2):\s+(.+)$/gm;
  const results = [];
  let match;

  regex.lastIndex = 0;
  while ((match = regex.exec(output)) !== null) {
    results.push({
      file: '',
      line: 0,
      column: 0,
      type: 'error',
      message: match[1].trim(),
      category: 'linker',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Python script errors
// ---------------------------------------------------------------------------

/**
 * Matches Python ImportError, ModuleNotFoundError, and traceback frames.
 *
 * Pattern 1: `ImportError: No module named 'xyz'`
 * Pattern 2: `File "<path>", line N, in <scope>`
 *
 * @param {string} output
 * @param {string} [projectDir='']
 * @returns {Array<object>}
 */
export function parsePythonErrors(output, projectDir = '') {
  const regex = /^((?:ImportError|ModuleNotFoundError|SyntaxError|NameError|TypeError|ValueError|RuntimeError):\s*.+)$/gm;
  const traceRegex = /^\s*File "([^"]+)", line (\d+)(?:, in (.+))?/gm;
  const results = [];
  let match;

  // Match direct error lines
  regex.lastIndex = 0;
  while ((match = regex.exec(output)) !== null) {
    results.push({
      file: '',
      line: 0,
      column: 0,
      type: 'error',
      message: match[1].trim(),
      category: 'python',
    });
  }

  // Match traceback frames
  traceRegex.lastIndex = 0;
  while ((match = traceRegex.exec(output)) !== null) {
    const [, filePath, line, scope] = match;
    results.push({
      file: relativize(filePath, projectDir),
      line: parseInt(line, 10),
      column: 0,
      type: 'note',
      message: scope ? `Traceback frame: in ${scope}` : 'Traceback frame',
      category: 'python',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// CMake errors (IDF build system)
// ---------------------------------------------------------------------------

/**
 * Matches `CMake Error at <file>:<line>:` blocks.
 * The error message may span multiple indented lines.
 *
 * @param {string} output
 * @param {string} [projectDir='']
 * @returns {Array<object>}
 */
export function parseCMakeErrors(output, projectDir = '') {
  const regex = /^CMake (?:Error|Warning) at (\/?[^:\n]+):(\d+):\s*\n((?:\s+.+\n|\s*$)*)/gm;
  const results = [];
  let match;

  regex.lastIndex = 0;
  while ((match = regex.exec(output)) !== null) {
    const [, filePath, line, messageBlock] = match;
    const msgLines = messageBlock
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const type = output.slice(match.index).includes('CMake Error')
      ? 'error'
      : 'warning';

    results.push({
      file: relativize(filePath, projectDir),
      line: parseInt(line, 10),
      column: 0,
      type,
      message: msgLines.join(' '),
      category: 'cmake',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Multi-line GCC notes
// ---------------------------------------------------------------------------

/**
 * Parses `note:` continuation lines and attaches them to the preceding
 * diagnostic entry as a `notes` array.
 *
 * @param {string} output
 * @param {string} [projectDir='']
 * @param {Array<object>} existingDiagnostics
 * @returns {Array<object>} — the mutated existingDiagnostics
 */
export function parseMultiLineGCCNotes(output, projectDir = '', existingDiagnostics = []) {
  const regex = /^(.+?):(\d+):(\d+):\s+note:\s+(.+)$/gm;
  let match;

  regex.lastIndex = 0;

  // First pass: collect all note lines
  const noteLines = [];
  while ((match = regex.exec(output)) !== null) {
    noteLines.push({
      file: relativize(match[1], projectDir),
      line: parseInt(match[2], 10),
      column: parseInt(match[3], 10),
      message: match[4].trim(),
    });
  }

  // Second pass: attach notes to matching diagnostics
  for (const note of noteLines) {
    const parent = existingDiagnostics.find(
      (d) =>
        d.file === note.file &&
        Math.abs((d.line || 0) - note.line) <= 1,
    );
    if (parent) {
      if (!parent.notes) parent.notes = [];
      parent.notes.push(note.message);
    } else {
      // No matching parent — add as standalone note diagnostic
      existingDiagnostics.push({
        file: note.file,
        line: note.line,
        column: note.column,
        type: 'note',
        message: note.message,
        category: 'gcc',
      });
    }
  }

  return existingDiagnostics;
}

// ---------------------------------------------------------------------------
// Single-line GCC (imported from tools/build.js via parseDiagnostics)
// ---------------------------------------------------------------------------

const GCC_DIAGNOSTIC_RE =
  /^(.+?):(\d+):(\d+):\s+(warning|error|fatal error|note):\s+(.+)$/gm;

/**
 * Parses single-line GCC/Clang diagnostics.
 * This is a standalone version (doesn't depend on the build.js module
 * to avoid circular imports for parseAllDiagnostics).
 *
 * @param {string} output
 * @param {string} [projectDir='']
 * @returns {Array<object>}
 */
export function parseSingleLineGCC(output, projectDir = '') {
  const results = [];
  let match;

  GCC_DIAGNOSTIC_RE.lastIndex = 0;
  while ((match = GCC_DIAGNOSTIC_RE.exec(output)) !== null) {
    const [, filePath, line, col, type, message] = match;
    results.push({
      file: relativize(filePath, projectDir),
      line: parseInt(line, 10),
      column: parseInt(col, 10),
      type,
      message,
      category: 'gcc',
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Combined parser
// ---------------------------------------------------------------------------

/**
 * Runs all diagnostic parsers on the output and merges results.
 * Deduplicates by file+line+message.
 *
 * @param {string} output — Raw build output
 * @param {string} [projectDir=''] — For relative path resolution
 * @returns {Array<object>}
 */
export function parseAllDiagnostics(output, projectDir = '') {
  // Run individual parsers
  const gcc = parseSingleLineGCC(output, projectDir);
  const linker = parseLinkerErrors(output, projectDir);
  const python = parsePythonErrors(output, projectDir);
  const cmake = parseCMakeErrors(output, projectDir);

  // Merge and deduplicate
  const all = [...gcc, ...linker, ...python, ...cmake];
  const seen = new Set();
  const deduped = all.filter((d) => {
    const key = `${d.file}:${d.line}:${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Attach multi-line GCC notes
  parseMultiLineGCCNotes(output, projectDir, deduped);

  return deduped;
}
