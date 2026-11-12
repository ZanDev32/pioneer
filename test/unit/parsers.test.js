import { describe, it, expect } from 'vitest';
import {
  parseSingleLineGCC,
  parseLinkerErrors,
  parsePythonErrors,
  parseCMakeErrors,
  parseMultiLineGCCNotes,
  parseAllDiagnostics,
} from '../../src/parsers.js';

// All fixtures are inline strings (D-10) — no persisted log files.

describe('parseSingleLineGCC', () => {
  it('extracts file, line, column, type, message, and category from one diagnostic', () => {
    const diagnostics = parseSingleLineGCC(
      "src/main.cpp:42:7: error: 'x' was not declared\n",
    );

    expect(diagnostics).toEqual([
      {
        file: 'src/main.cpp',
        line: 42,
        column: 7,
        type: 'error',
        message: "'x' was not declared",
        category: 'gcc',
      },
    ]);
  });

  it('parses warnings, fatal errors, and several lines in order', () => {
    const diagnostics = parseSingleLineGCC(
      'src/a.c:1:2: warning: unused variable\n' +
        'src/a.c:3:4: fatal error: missing.h: No such file or directory\n',
    );

    expect(diagnostics.map((d) => d.type)).toEqual(['warning', 'fatal error']);
    expect(diagnostics.map((d) => d.line)).toEqual([1, 3]);
    expect(diagnostics[1].message).toBe('missing.h: No such file or directory');
  });

  it('relativizes paths under the project dir and leaves others alone', () => {
    const diagnostics = parseSingleLineGCC(
      '/proj/src/main.cpp:5:1: error: boom\n/other/lib.c:6:2: error: afar\n',
      '/proj',
    );

    expect(diagnostics.map((d) => d.file)).toEqual(['src/main.cpp', '/other/lib.c']);
  });
});

describe('parseLinkerErrors', () => {
  it('parses ld lines as linker errors with empty file and line 0', () => {
    const diagnostics = parseLinkerErrors(
      "/usr/bin/ld: undefined reference to 'setup'\n",
    );

    expect(diagnostics).toEqual([
      {
        file: '',
        line: 0,
        column: 0,
        type: 'error',
        message: "undefined reference to 'setup'",
        category: 'linker',
      },
    ]);
  });

  it('parses collect2 lines as linker errors', () => {
    const diagnostics = parseLinkerErrors(
      'collect2: error: ld returned 1 exit status\n',
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].category).toBe('linker');
    expect(diagnostics[0].message).toBe('error: ld returned 1 exit status');
  });
});

describe('parsePythonErrors', () => {
  it('parses a ModuleNotFoundError line without throwing', () => {
    const diagnostics = parsePythonErrors(
      "ModuleNotFoundError: No module named 'foo'\n",
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toEqual({
      file: '',
      line: 0,
      column: 0,
      type: 'error',
      message: "ModuleNotFoundError: No module named 'foo'",
      category: 'python',
    });
  });

  it('parses a traceback plus its terminal error line', () => {
    const diagnostics = parsePythonErrors(
      'Traceback (most recent call last):\n' +
        '  File "src/foo.py", line 12, in <module>\n' +
        "ModuleNotFoundError: No module named 'foo'\n",
    );

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].category).toBe('python');
    expect(diagnostics[1]).toEqual({
      file: 'src/foo.py',
      line: 12,
      column: 0,
      type: 'note',
      message: 'Traceback frame: in <module>',
      category: 'python',
    });
  });

  it('parses a traceback with no scope and relativizes the frame path', () => {
    const diagnostics = parsePythonErrors(
      '  File "/proj/scripts/build.py", line 3\nImportError: cannot import name \'x\'\n',
      '/proj',
    );

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ type: 'error', category: 'python' });
    expect(diagnostics[1].file).toBe('scripts/build.py');
    expect(diagnostics[1].message).toBe('Traceback frame');
    expect(diagnostics[1].type).toBe('note');
  });
});

describe('parseCMakeErrors', () => {
  it('parses CMake Error blocks with the message joined from indented lines', () => {
    const diagnostics = parseCMakeErrors(
      'CMake Error at CMakeLists.txt:12:\n  Could not find component\n  second line\n\n',
    );

    expect(diagnostics).toEqual([
      {
        file: 'CMakeLists.txt',
        line: 12,
        column: 0,
        type: 'error',
        message: 'Could not find component second line',
        category: 'cmake',
      },
    ]);
  });

  it('classifies a CMake Warning block as a warning', () => {
    const diagnostics = parseCMakeErrors(
      'CMake Warning at src/x.cmake:3:\n  deprecated thing\n\n',
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].type).toBe('warning');
    expect(diagnostics[0].category).toBe('cmake');
  });
});

describe('parseMultiLineGCCNotes', () => {
  const parent = {
    file: 'src/main.cpp',
    line: 42,
    column: 7,
    type: 'error',
    message: "'x' was not declared",
    category: 'gcc',
  };

  it('attaches a note to the nearest preceding diagnostic instead of adding an entry', () => {
    const diagnostics = parseMultiLineGCCNotes(
      "src/main.cpp:43:9: note: did you mean 'y'?\n",
      '',
      [{ ...parent }],
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].notes).toEqual(["did you mean 'y'?"]);
  });

  it('adds a standalone note diagnostic when no parent is within one line', () => {
    const diagnostics = parseMultiLineGCCNotes(
      'src/other.cpp:1:1: note: orphan note\n',
      '',
      [{ ...parent }],
    );

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[1]).toEqual({
      file: 'src/other.cpp',
      line: 1,
      column: 1,
      type: 'note',
      message: 'orphan note',
      category: 'gcc',
    });
  });

  it('mutates and returns the diagnostics array it was given', () => {
    const existing = [{ ...parent }];
    const returned = parseMultiLineGCCNotes(
      'src/main.cpp:43:9: note: attach me\n',
      '',
      existing,
    );

    expect(returned).toBe(existing);
  });
});

describe('parseAllDiagnostics', () => {
  it('merges the parsers gcc → linker → python → cmake, preserving first-seen order', () => {
    const diagnostics = parseAllDiagnostics(
      'src/a.c:1:2: warning: w1\n' +
        "/usr/bin/ld: undefined reference to 'setup'\n" +
        "ModuleNotFoundError: No module named 'foo'\n" +
        'CMake Error at CMakeLists.txt:12:\n  bad\n',
    );

    expect(diagnostics.map((d) => d.category)).toEqual([
      'gcc',
      'linker',
      'python',
      'cmake',
    ]);
  });

  it('drops duplicates by file:line:message and keeps the first occurrence', () => {
    const diagnostics = parseAllDiagnostics(
      'src/a.c:1:2: warning: w1\n' +
        'src/a.c:1:2: warning: w1\n' +
        'src/a.c:2:2: warning: w1\n',
    );

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics.map((d) => d.line)).toEqual([1, 2]);
  });

  it('keeps the error and attaches its note in one merged pass', () => {
    const diagnostics = parseAllDiagnostics(
      "src/main.cpp:42:7: error: 'x' was not declared\n" +
        "src/main.cpp:43:9: note: did you mean 'y'?\n",
    );

    const error = diagnostics.find((d) => d.type === 'error');
    const note = diagnostics.find((d) => d.type === 'note');

    expect(error.file).toBe('src/main.cpp');
    expect(note.message).toBe("did you mean 'y'?");
    expect(note.notes).toEqual(["did you mean 'y'?"]);
  });

  it('parses a ~50 KB synthetic log in under 100 ms (NFR-1 parsing bullet)', () => {
    const lines = [];
    let i = 0;
    while (lines.join('\n').length < 50 * 1024) {
      lines.push(
        `src/very/long/path/to/source/file_${i}.cpp:${i + 1}:5: error: ` +
          `synthetic diagnostic message number ${i} for the parsers performance case`,
      );
      i += 1;
    }
    const log = lines.join('\n');
    expect(Buffer.byteLength(log)).toBeGreaterThanOrEqual(50 * 1024);

    const started = performance.now();
    const diagnostics = parseAllDiagnostics(log);
    const elapsed = performance.now() - started;

    expect(diagnostics).toHaveLength(i);
    expect(elapsed).toBeLessThan(100);
  });
});
