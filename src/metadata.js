
/**
 * Build metadata extractor.
 *
 * Extracts duration, binary size, and RAM/Flash usage from PIO build output.
 * Also provides incremental diagnostics filtering (only files changed since last build).
 */

import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Build metadata parser
// ---------------------------------------------------------------------------

/**
 * Extracts build metadata from raw PIO output.
 *
 * @param {string} output — Raw build output (stdout + stderr)
 * @param {string} [projectDir=''] — For resolving firmware binary path
 * @param {string} [envName=''] — Environment name for .pio/build/<env>/ path
 * @returns {{
 *   duration_seconds: number|null,
 *   binary_size_bytes: number|null,
 *   memory: {
 *     ram_used_bytes: number,
 *     ram_total_bytes: number,
 *     ram_percent: number,
 *     flash_used_bytes: number,
 *     flash_total_bytes: number,
 *     flash_percent: number
 *   }|null
 * }}
 */
export function parseBuildMetadata(output, projectDir = '', envName = '') {
  const result = {
    duration_seconds: null,
    binary_size_bytes: null,
    memory: null,
  };

  // Duration: "Took 5.42 seconds"
  const durationMatch = output.match(/Took\s+([\d.]+)\s+seconds/);
  if (durationMatch) {
    result.duration_seconds = parseFloat(durationMatch[1]);
  }

  // RAM: "RAM:   [=         ]   9.8% (used 32000 bytes from 327680 bytes)"
  const ramMatch = output.match(
    /RAM:\s+\[[=\s]+?\]\s+([\d.]+)%\s+\(used\s+(\d+)\s+bytes\s+from\s+(\d+)\s+bytes\)/,
  );
  // Flash: "Flash: [==========]  5.9% (used 245760 bytes from 4194304 bytes)"
  const flashMatch = output.match(
    /Flash:\s+\[[=\s]+?\]\s+([\d.]+)%\s+\(used\s+(\d+)\s+bytes\s+from\s+(\d+)\s+bytes\)/,
  );

  if (ramMatch || flashMatch) {
    result.memory = {};

    if (ramMatch) {
      const [, percent, used, total] = ramMatch;
      result.memory.ram_percent = parseFloat(percent);
      result.memory.ram_used_bytes = parseInt(used, 10);
      result.memory.ram_total_bytes = parseInt(total, 10);
    }

    if (flashMatch) {
      const [, percent, used, total] = flashMatch;
      result.memory.flash_percent = parseFloat(percent);
      result.memory.flash_used_bytes = parseInt(used, 10);
      result.memory.flash_total_bytes = parseInt(total, 10);
    }
  }

  // Binary size: check for built firmware binary
  if (projectDir && envName) {
    const fwPath = path.join(
      projectDir,
      '.pio',
      'build',
      envName,
      'firmware.bin',
    );
    try {
      const stat = fs.statSync(fwPath);
      result.binary_size_bytes = stat.size;
    } catch {
      // Binary not found — may still be an ELF-only build
      const elfPath = path.join(
        projectDir,
        '.pio',
        'build',
        envName,
        'firmware.elf',
      );
      try {
        const stat = fs.statSync(elfPath);
        result.binary_size_bytes = stat.size;
      } catch {
        // not available
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Incremental diagnostics filtering
// ---------------------------------------------------------------------------

/**
 * Get the mtime of the build cache directory (.pio/build/<env>/).
 * Returns 0 if the directory doesn't exist.
 *
 * @param {string} projectDir
 * @param {string} envName
 * @returns {number} — Timestamp in ms, or 0 if directory absent
 */
function getBuildCacheMtime(projectDir, envName) {
  const cacheDir = path.join(projectDir, '.pio', 'build', envName);
  try {
    const stat = fs.statSync(cacheDir);
    return stat.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Check if a file path belongs to a file modified after the build cache.
 *
 * @param {string} filePath
 * @param {number} cacheMtime — Build cache directory mtime (0 = first build)
 * @returns {boolean}
 */
function isFileModified(filePath, cacheMtime) {
  if (cacheMtime === 0) return true; // First build — include all
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs > cacheMtime;
  } catch {
    return false;
  }
}

/**
 * Filters diagnostics to only include files modified since the last build.
 *
 * On the first build (no .pio/build/<env>/ directory), returns all diagnostics.
 *
 * @param {string} projectDir
 * @param {string} envName
 * @param {Array<object>} diagnostics
 * @returns {Array<object>} — Filtered diagnostics
 */
export function parseIncrementalDiagnostics(projectDir, envName, diagnostics) {
  const cacheMtime = getBuildCacheMtime(projectDir, envName);

  // First build — no cache yet, return everything
  if (cacheMtime === 0) return diagnostics;

  return diagnostics.filter((d) => {
    // Keep diagnostics without file paths (linker errors, python errors)
    if (!d.file || d.line === 0) return true;

    // Resolve the file path relative to project dir
    const absPath = path.isAbsolute(d.file)
      ? d.file
      : path.resolve(projectDir, d.file);

    return isFileModified(absPath, cacheMtime);
  });
}

/**
 * Returns the size (in bytes) of a directory, recursively.
 *
 * @param {string} dirPath
 * @returns {number}
 */
export function getDirSize(dirPath) {
  let totalSize = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += getDirSize(fullPath);
      } else if (entry.isFile()) {
        try {
          totalSize += fs.statSync(fullPath).size;
        } catch {
          // stat failed, skip
        }
      }
    }
  } catch {
    // directory doesn't exist or isn't readable
  }
  return totalSize;
}
