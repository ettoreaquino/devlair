# Changelog

## [2.3.0-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.5-alpha.1...devlair-cli-v2.3.0-alpha.1) (2026-05-17)


### Features

* **modules/tailscale:** drive interactive auth and wait until connected ([962112b](https://github.com/ettoreaquino/devlair/commit/962112bc1715309f156cd6a6dca34a685a8a025a))
* **modules/tailscale:** drive interactive auth and wait until connected ([0d27beb](https://github.com/ettoreaquino/devlair/commit/0d27beb2a8824e226276264f0a703ee23e9a9362))

## [2.2.5-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.4-alpha.1...devlair-cli-v2.2.5-alpha.1) (2026-05-17)


### Bug Fixes

* **modules/tailscale:** never block on interactive browser auth ([e4ba6eb](https://github.com/ettoreaquino/devlair/commit/e4ba6ebecaf542b8aa982ffef53839a6017c7053))
* **modules/tailscale:** never block on interactive browser auth ([a62df9f](https://github.com/ettoreaquino/devlair/commit/a62df9f6921b75ceba3be78a9e5319a3479a846f))

## [2.2.4-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.3-alpha.1...devlair-cli-v2.2.4-alpha.1) (2026-05-17)


### Bug Fixes

* **cli:** release v2.2.4-alpha.1 with WSL bootstrap fixes ([68bac61](https://github.com/ettoreaquino/devlair/commit/68bac6179e7eee6e24dd64f0ff57b5179f2b643e))
* **cli:** trigger v2.2.4-alpha.1 release with WSL bootstrap fixes ([9d221b1](https://github.com/ettoreaquino/devlair/commit/9d221b1e0a932b52d39fbcff62e94942f6137da4))

## [2.2.3-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.2-alpha.1...devlair-cli-v2.2.3-alpha.1) (2026-05-16)


### Bug Fixes

* **v2:** bootstrap jq + surface stderr in init UI ([4abd41e](https://github.com/ettoreaquino/devlair/commit/4abd41e4e0aa3960e81f7c1ffb594c9824f896fe))
* **v2:** bootstrap jq + surface stderr so init failures aren't silent ([fbcc5d8](https://github.com/ettoreaquino/devlair/commit/fbcc5d86106532e11fd46e005ed15e52e1de1ff0))

## [2.2.2-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.1-alpha.1...devlair-cli-v2.2.2-alpha.1) (2026-05-16)


### Bug Fixes

* **v2/install:** ship modules tarball alongside binary ([75d6415](https://github.com/ettoreaquino/devlair/commit/75d641524700acfd7db640c2eb5cc7f2e3da917a))
* **v2/install:** ship modules tarball alongside binary ([d6ef9f4](https://github.com/ettoreaquino/devlair/commit/d6ef9f4d9af3a85d7089007934e03016a87547e4)), closes [#84](https://github.com/ettoreaquino/devlair/issues/84)

## [2.2.1-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.2.0-alpha.1...devlair-cli-v2.2.1-alpha.1) (2026-05-16)


### Bug Fixes

* **cli:** re-exec with execPath under sudo so bun-compiled binary elevates ([1986963](https://github.com/ettoreaquino/devlair/commit/1986963a23ae1b88457b619c4b9eb37a7b336545)), closes [#81](https://github.com/ettoreaquino/devlair/issues/81)
* **cli:** re-exec with execPath under sudo to fix WSL elevation ([1455ffd](https://github.com/ettoreaquino/devlair/commit/1455ffd4ee431c553874efb515f8d31e793a3ed5))

## [2.2.0-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.1.0-alpha.1...devlair-cli-v2.2.0-alpha.1) (2026-05-16)


### Features

* **cli:** port disable-password and claude commands (no dashboard) ([6dc75d8](https://github.com/ettoreaquino/devlair/commit/6dc75d8150a37b92c5622a6fa42fb28e7d1ca27f))
* **cli:** port disable-password and claude commands (no dashboard) ([3f70e4a](https://github.com/ettoreaquino/devlair/commit/3f70e4ad0d1a09ad9a3b052211678fe073c9022d)), closes [#45](https://github.com/ettoreaquino/devlair/issues/45)
* **cli:** TS profile system with Zod validation and remote fetch ([ec45687](https://github.com/ettoreaquino/devlair/commit/ec45687b30f1678d411a163dbc102fa9da2329a6)), closes [#46](https://github.com/ettoreaquino/devlair/issues/46)


### Bug Fixes

* **v2:** address PR review findings on claude + disable-password ([30ab526](https://github.com/ettoreaquino/devlair/commit/30ab5265b3dc1948ab55f3463fcb38194876ce71))

## [2.1.0-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.0.0-alpha.1...devlair-cli-v2.1.0-alpha.1) (2026-05-10)


### Features

* **cli:** add doctor and upgrade commands ([c4f0a11](https://github.com/ettoreaquino/devlair/commit/c4f0a11ddeec1ac8688692cc3b41a80cffe0e515))
* **cli:** add doctor and upgrade commands ([6e95e52](https://github.com/ettoreaquino/devlair/commit/6e95e52d70e7543f97ff7385510c33378d3b0c92)), closes [#44](https://github.com/ettoreaquino/devlair/issues/44)
* **cli:** add interactive wizard for init command ([3c124d2](https://github.com/ettoreaquino/devlair/commit/3c124d2751f73b7147bead0a207bbd4a92bb509a))
* **cli:** add interactive wizard for init command ([125f0a6](https://github.com/ettoreaquino/devlair/commit/125f0a6e581d6d6859aae0e2ad80e0c266cf1572)), closes [#43](https://github.com/ettoreaquino/devlair/issues/43)
* **cli:** JSON module protocol and TypeScript runner ([#54](https://github.com/ettoreaquino/devlair/issues/54)) ([e13d1b4](https://github.com/ettoreaquino/devlair/commit/e13d1b404182f5472b8bcb927bf596a3468340e0))
* **cli:** module registry, platform detection, and context builder ([f171400](https://github.com/ettoreaquino/devlair/commit/f17140002973416d0e2e16a1853808589c7674b9)), closes [#41](https://github.com/ettoreaquino/devlair/issues/41)
* **cli:** port init command to Ink with progress and summary ([04931b7](https://github.com/ettoreaquino/devlair/commit/04931b73a831d398e7dea44f30ec10608a87d62e))
* **cli:** port logo + help screen to Ink components ([#51](https://github.com/ettoreaquino/devlair/issues/51)) ([2457417](https://github.com/ettoreaquino/devlair/commit/2457417eeee2fd1badac6dac7d1adff88a6d62f6))
* **cli:** scaffold TypeScript + Ink + Bun project for v2 ([#49](https://github.com/ettoreaquino/devlair/issues/49)) ([e36ceb7](https://github.com/ettoreaquino/devlair/commit/e36ceb7b6bff423fc040c352fe720ae925406b7a))
* **modules:** extract all 14 Python modules to shell scripts ([b36754a](https://github.com/ettoreaquino/devlair/commit/b36754a6e9db1fe239f30f5a3c98d29cd5f4394c)), closes [#40](https://github.com/ettoreaquino/devlair/issues/40)


### Bug Fixes

* **cli:** address review findings in init command ([e5bc01d](https://github.com/ettoreaquino/devlair/commit/e5bc01da7670577d11aa6c31f95cf243ae98917b))
* **cli:** consolidate fs imports and update README project structure ([46768e0](https://github.com/ettoreaquino/devlair/commit/46768e0574ca7442a61be408669b4a273d012b6f))
* **cli:** resolve lint error in useModuleExecution hook ([360bf5e](https://github.com/ettoreaquino/devlair/commit/360bf5e9d6efd625ca8c767e6662f45a42d94836))
* **wizard:** reinitialize module state when specs change and clean up render logic ([6a66c6b](https://github.com/ettoreaquino/devlair/commit/6a66c6bcdbf6eb0e3218b4d804dc8d676721c498))
