# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - unreleased

### Breaking

- Published as the scoped package `@zandev32/pioneer`; the unscoped `pioneer` name is
  not published and the binary stays `pioneer`.

### Added

- `LICENSE` (Apache-2.0) ships in the package tarball, matching the `license` metadata.
- `prepublishOnly` build hook, so `dist/` is always present in the published artifact.
- Vitest suite: unit tests for the parsers, errors, metadata, and `TaskManager`, plus an
  integration layer over real `pio` invocations.
- Protocol lane (`npm run test:protocol`) that drives the built bundle through the MCP
  Inspector CLI, so the shipped artifact — not just the source — is exercised.
- CI matrix (`.github/workflows/ci.yml`): build and tests on Linux, macOS, and Windows
  across Node 22 and 24, a protocol job, and an opt-in end-to-end job.
- Host config fixtures for Claude Desktop, Cursor, and VS Code, and a host smoke-test
  checklist for milestone releases.

### Changed

- Upgraded `@modelcontextprotocol/sdk` from the deprecated positional `server.tool()`
  overloads to `server.registerTool(name, { description, inputSchema }, handler)` on the
  pinned 1.x line (`^1.32.2`); all 12 tools keep their names, descriptions, and schemas.
- Raised the Node.js floor to `>=22.12.0`, required by the Vitest 5 test runner.
- `repository`, `bugs`, and `homepage` now point at `github.com/ZanDev32/pioneer`.

[Unreleased]: https://github.com/ZanDev32/pioneer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ZanDev32/pioneer/releases/tag/v0.2.0
