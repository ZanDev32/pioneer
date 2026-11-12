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

### Changed

- Upgraded `@modelcontextprotocol/sdk` from the deprecated positional `server.tool()`
  overloads to `server.registerTool(name, { description, inputSchema }, handler)` on the
  pinned 1.x line (`^1.32.2`); all 12 tools keep their names, descriptions, and schemas.
- Raised the Node.js floor to `>=22.12.0`, required by the Vitest 5 test runner.
- `repository`, `bugs`, and `homepage` now point at `github.com/ZanDev32/pioneer`.

[Unreleased]: https://github.com/ZanDev32/pioneer/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ZanDev32/pioneer/releases/tag/v0.2.0
