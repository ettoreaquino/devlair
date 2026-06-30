# Changelog

## [3.2.0](https://github.com/ettoreaquino/devlair/compare/v3.1.2...v3.2.0) (2026-06-30)


### Features

* **cli:** port VS Code install + Terminal.app Dracula to v3 cli modules ([#253](https://github.com/ettoreaquino/devlair/issues/253)) ([131b95d](https://github.com/ettoreaquino/devlair/commit/131b95d0ccecaf92023d0a40b9f2a717037c1a35))

## [3.1.2](https://github.com/ettoreaquino/devlair/compare/v3.1.1...v3.1.2) (2026-06-30)


### Bug Fixes

* **macos:** propagate brew PATH to module subshells ([#247](https://github.com/ettoreaquino/devlair/issues/247)) ([a36193b](https://github.com/ettoreaquino/devlair/commit/a36193be515ad3c11c527f21efe93d319c38a381))

## [3.1.1](https://github.com/ettoreaquino/devlair/compare/v3.1.0...v3.1.1) (2026-06-29)


### Bug Fixes

* **uninstall:** confirm Homebrew removal and tear it down last ([#244](https://github.com/ettoreaquino/devlair/issues/244)) ([558d967](https://github.com/ettoreaquino/devlair/commit/558d967bfd7849ff57bd803c9ee610000a52fd41)), closes [#243](https://github.com/ettoreaquino/devlair/issues/243)

## [3.1.0](https://github.com/ettoreaquino/devlair/compare/v3.0.3...v3.1.0) (2026-06-29)


### Features

* **uninstall:** always confirm + interactive sudo, add --force ([#241](https://github.com/ettoreaquino/devlair/issues/241)) ([e09d478](https://github.com/ettoreaquino/devlair/commit/e09d478906db63f5b42d4f8960faafdcb4de5790))

## [3.0.3](https://github.com/ettoreaquino/devlair/compare/v3.0.2...v3.0.3) (2026-06-29)


### Bug Fixes

* **macos:** interactive Homebrew pre-flight + noclobber-safe zsh ([#236](https://github.com/ettoreaquino/devlair/issues/236)) ([9c152cc](https://github.com/ettoreaquino/devlair/commit/9c152ccaacee827278bafdf21da4f9efb20ec256))

## [3.0.2](https://github.com/ettoreaquino/devlair/compare/v3.0.1...v3.0.2) (2026-06-29)


### Bug Fixes

* **github:** stop init hanging at SSH-auth step, add Enter escape ([#233](https://github.com/ettoreaquino/devlair/issues/233)) ([a0ae4a6](https://github.com/ettoreaquino/devlair/commit/a0ae4a63c7406457abf2a7ac81b186440c4af082))

## [3.0.1](https://github.com/ettoreaquino/devlair/compare/v3.0.0...v3.0.1) (2026-06-29)


### Bug Fixes

* **devtools:** chown temp installer to target user ([4ed0a6d](https://github.com/ettoreaquino/devlair/commit/4ed0a6d5efc1fad3ffce70cb996a478395eb5cfa))
* **devtools:** chown temp installer to target user ([2839518](https://github.com/ettoreaquino/devlair/commit/2839518de352b525d9b97254110b39b6053c6da5))
* **devtools:** grant read instead of chown on temp installer ([d8cf8cc](https://github.com/ettoreaquino/devlair/commit/d8cf8ccb967497b674afc5ddf88517415099364c))
* **init:** prune init logs by run name, not filesystem mtime ([60bdd6e](https://github.com/ettoreaquino/devlair/commit/60bdd6e1121ae76c92871b924b762bb9d280bb0a))
* **init:** prune init logs by run name, not filesystem mtime ([2eb625c](https://github.com/ettoreaquino/devlair/commit/2eb625c441ff0de2ad53969b8e9c57a19aa5aa31))
* **shell:** preserve newline on .zshrc alias refresh ([28a0964](https://github.com/ettoreaquino/devlair/commit/28a096455d9edf26f6f325c3903942ae33189942))
* **shell:** preserve newline on .zshrc alias refresh ([d07f4a3](https://github.com/ettoreaquino/devlair/commit/d07f4a37b42bb39d063625c85cb6a7f8a8f50301))

## [3.0.0](https://github.com/ettoreaquino/devlair/compare/v2.12.1...v3.0.0) (2026-06-26)


### ⚠ BREAKING CHANGES

* **cli:** devlair no longer installs the Telegram channel plugin or the `devlair claude --channels` view. Existing channel state under ~/.claude/channels/ is left in place (cleaned by `devlair uninstall`).

### Features

* **cli:** full interactive devlair uninstall ([aec3296](https://github.com/ettoreaquino/devlair/commit/aec329618927d5fa94803e2ceb3e58fd01fcff3a))
* **cli:** full interactive devlair uninstall ([9b9f51d](https://github.com/ettoreaquino/devlair/commit/9b9f51d5b6a9dc9c1d74dfe4ece3570217f72bf2))
* **cli:** retire Claude/Telegram channels feature ([e88ecc3](https://github.com/ettoreaquino/devlair/commit/e88ecc35c2c5fdb2935946be7e74e3fd05d12bf1))
* **shell:** render --brand in the login banner and persist it ([a45838f](https://github.com/ettoreaquino/devlair/commit/a45838fc1e7f856cfedc2de839c4afc63523685e))
* **shell:** render --brand in the login banner and persist it ([00a8bec](https://github.com/ettoreaquino/devlair/commit/00a8becde71de431cee8edf9760518def680f617))


### Bug Fixes

* **claude:** drop legacy channel/hook keys from settings on re-init ([63b6f5a](https://github.com/ettoreaquino/devlair/commit/63b6f5a42372dd58b221f20f0273d5568ea0dd51))
* **uninstall:** address PR review — validate restored shell, harden dconf path, batch autoremove ([034bc54](https://github.com/ettoreaquino/devlair/commit/034bc542a98306620779884d7ddbdbf73cebc5ca))
* **uninstall:** don't self-abort the teardown in non-interactive mode ([b8e0998](https://github.com/ettoreaquino/devlair/commit/b8e099845f60fcb2f39d20004dfd2bc3ab51d01f))

## [2.12.1](https://github.com/ettoreaquino/devlair/compare/v2.12.0...v2.12.1) (2026-06-25)


### Bug Fixes

* **claude:** prevent silent set -e abort in chown helpers on non-root macOS ([5e3c120](https://github.com/ettoreaquino/devlair/commit/5e3c120affc62b498c979a5446f9bde75cae3080))
* **claude:** prevent silent set -e abort in chown helpers on non-root macOS ([11ca2f5](https://github.com/ettoreaquino/devlair/commit/11ca2f5e1844ad1260b260d0408c28cef6695069))

## [2.12.0](https://github.com/ettoreaquino/devlair/compare/v2.11.4...v2.12.0) (2026-06-25)


### Features

* **cli:** add devlair uninstall command ([ef24b5c](https://github.com/ettoreaquino/devlair/commit/ef24b5cfc1df01af6a2851a7bdb78aa0dccfcde7))


### Bug Fixes

* **cli:** address PR review findings on fix/macos-brew-preflight ([7f5817b](https://github.com/ettoreaquino/devlair/commit/7f5817b9d633337aa832f8faf8eb54fa0e45af12))
* **macos:** detect non-admin user before attempting Homebrew installation ([e43a8b5](https://github.com/ettoreaquino/devlair/commit/e43a8b54bdabc301c461d3978af196e5c3e70952))
* **macos:** init failures + add devlair uninstall command ([da6cca8](https://github.com/ettoreaquino/devlair/commit/da6cca8708f98dcd34f732330fd7705bf1e1cee7))

## [2.11.4](https://github.com/ettoreaquino/devlair/compare/v2.11.3...v2.11.4) (2026-06-25)


### Bug Fixes

* **cli:** address PR review findings on fix/macos-brew-preflight ([2376f9e](https://github.com/ettoreaquino/devlair/commit/2376f9e987e82d156c0562614ea0bf483430c033))
* **macos:** clean init UX — homebrew as step [1/8], dscl shell change, permission recovery ([87421b8](https://github.com/ettoreaquino/devlair/commit/87421b8201f3faee7a9d27aaf18ecddbb3d52dc1))
* **macos:** improve homebrew preflight and fix shell-change failures ([195ac86](https://github.com/ettoreaquino/devlair/commit/195ac86abc259dc3cec61f32361d94bdf07a0753))

## [2.11.3](https://github.com/ettoreaquino/devlair/compare/v2.11.2...v2.11.3) (2026-06-25)


### Bug Fixes

* **cli:** address PR review findings on fix/macos-brew-preflight ([e67847d](https://github.com/ettoreaquino/devlair/commit/e67847d9b3fdbf8e96c3edc65bd94104e4e14d33))
* **cli:** address PR review findings on fix/macos-brew-preflight ([5b61189](https://github.com/ettoreaquino/devlair/commit/5b61189a735d45713485630f549a964390cdb3ed))
* **macos:** fix claude module for non-root macOS operation ([ba221da](https://github.com/ettoreaquino/devlair/commit/ba221da16ee4660956e6529b3f1f19398fee7e9f))
* **macos:** fix claude module for non-root macOS operation ([08e2301](https://github.com/ettoreaquino/devlair/commit/08e2301ad5d6b3797b36e03695973960c71eafdb))
* **macos:** fix lint format and update topological order test ([bda338f](https://github.com/ettoreaquino/devlair/commit/bda338fda1858ce043deb5a692644bfaa877d017))
* **macos:** run Homebrew pre-flight before Ink starts for TTY access ([70143d3](https://github.com/ettoreaquino/devlair/commit/70143d33eca78dbaa7e3cc815e4b9858531010b1))
* **macos:** run Homebrew pre-flight before Ink starts for TTY access ([705fc1c](https://github.com/ettoreaquino/devlair/commit/705fc1cc2f50db890c093570bfb8ee7076625019))

## [2.11.2](https://github.com/ettoreaquino/devlair/compare/v2.11.1...v2.11.2) (2026-06-25)


### Bug Fixes

* **cli:** address PR review findings on fix/macos-sudo-init ([a0a4ec2](https://github.com/ettoreaquino/devlair/commit/a0a4ec2d466e9fb4bde1b82469e6bb89aec8fba4))
* **macos:** improve CLI UX — sudo install, chsh, SSH label ([138136d](https://github.com/ettoreaquino/devlair/commit/138136dd4fb69558acb1125a593f8fc8c5aefda1))
* **macos:** improve UX for macOS users and clarify SSH module label ([9b26d6e](https://github.com/ettoreaquino/devlair/commit/9b26d6e63b80a463183d15fc5af1804aa37a73fb))

## [2.11.1](https://github.com/ettoreaquino/devlair/compare/v2.11.0...v2.11.1) (2026-06-25)


### Bug Fixes

* **init:** skip sudo elevation on macOS, fix chown group format ([151ecad](https://github.com/ettoreaquino/devlair/commit/151ecaded1e08f7bd81ac834b0748f80c546a0e9))
* **init:** skip sudo elevation on macOS, fix chown group format ([575cfa2](https://github.com/ettoreaquino/devlair/commit/575cfa205a8b4db28059c4b69e884627f9c3fef1))

## [2.11.0](https://github.com/ettoreaquino/devlair/compare/v2.10.0...v2.11.0) (2026-06-25)


### Features

* **macos:** homebrew preamble module + brew-first installs ([bf13005](https://github.com/ettoreaquino/devlair/commit/bf130053c5b60fc05e3d699fe62d41bcdf9afb18))
* **macos:** homebrew preamble module + brew-first installs for uv and bun ([e809fb3](https://github.com/ettoreaquino/devlair/commit/e809fb36c020b02daf01cc8d67cfdcb7b926e3c8))


### Bug Fixes

* **ci:** bump bun to 1.3.12 and stabilise pruneOldRuns sort ([4d69007](https://github.com/ettoreaquino/devlair/commit/4d69007ed5764620d0bbc85aa705804f98ab859a))
* **ci:** bump bun to 1.3.12 and stabilise pruneOldRuns sort ([877174c](https://github.com/ettoreaquino/devlair/commit/877174c2f60461f71bac2f8ecdbb57e405c0ca01))
* **cli:** address PR [#186](https://github.com/ettoreaquino/devlair/issues/186) review findings on fix/macos-sudo-root ([8bfd142](https://github.com/ettoreaquino/devlair/commit/8bfd14220c0570327136276feba84b96f379f003))
* **homebrew:** emit audit log entry after brew_ensure ([dcea040](https://github.com/ettoreaquino/devlair/commit/dcea04082e3d9adf021624694bf731dd8fa73cc2))
* **macos:** root-aware module execution + home dir + remove unsafe system modules ([8a5e86f](https://github.com/ettoreaquino/devlair/commit/8a5e86f75f8c5ea94c976db36ff8c305a346fbdf))
* **macos:** root-aware modules, home dir, remove FDA-gated system modules ([9719a83](https://github.com/ettoreaquino/devlair/commit/9719a83539b7c3e2e908006be6a1d9bfa267b8f5))

## [2.10.0](https://github.com/ettoreaquino/devlair/compare/v2.9.0...v2.10.0) (2026-06-25)


### Features

* **macos:** add macOS module support via Homebrew + fix brand header leak ([4af3f8b](https://github.com/ettoreaquino/devlair/commit/4af3f8b09a3d822205460c86365a3fac10827463))
* **macos:** Homebrew-based macOS module support + scope --brand to logo ([d3f155b](https://github.com/ettoreaquino/devlair/commit/d3f155b5b38501b89f525bcdc62567e17bf0441d))


### Bug Fixes

* **devlair:** address PR review findings on feat/brand-flag ([8b7f7e3](https://github.com/ettoreaquino/devlair/commit/8b7f7e33ffad5c24fe822696294b0070882f84be))

## [2.9.0](https://github.com/ettoreaquino/devlair/compare/v2.8.0...v2.9.0) (2026-06-24)


### Features

* **init:** add --brand flag to customise the init banner ([4c471ca](https://github.com/ettoreaquino/devlair/commit/4c471ca7a84893f6ebb5ccc83c2ee64a6f001513))
* **init:** add --brand flag to customise the init banner ([37fa5be](https://github.com/ettoreaquino/devlair/commit/37fa5be223e8db44f2803e7cc50855bb73360c5e))


### Bug Fixes

* **init:** brand sanitisation, ANSI strip, consistent fallback, string | undefined ([2d5a581](https://github.com/ettoreaquino/devlair/commit/2d5a5812ae4ebdc96d615b9ec70aeb7f6aa078de))
* **init:** make brand optional in InitFlags (string | undefined → brand?: string) ([acc988b](https://github.com/ettoreaquino/devlair/commit/acc988bf12681e9c6ef51531360000cd3f35bc27))

## [2.8.0](https://github.com/ettoreaquino/devlair/compare/v2.7.0...v2.8.0) (2026-06-24)


### Features

* **macos:** add macOS support to ssh module ([8fdcf62](https://github.com/ettoreaquino/devlair/commit/8fdcf628d99d4a0db4479e9b7ab5285ef2e2ac79))
* **macos:** add macOS support to ssh module (PR 2b) ([e4374c1](https://github.com/ettoreaquino/devlair/commit/e4374c19759fadb9737234bfa532ca26f614cad8))
* **macos:** add macOS support to timezone module ([a14bdea](https://github.com/ettoreaquino/devlair/commit/a14bdea7702e4da62a21c5d19fc0e2831276d491))
* **macos:** add macOS support to timezone module (PR 2c) ([b05555f](https://github.com/ettoreaquino/devlair/commit/b05555f0602fe3be9e278e03b8830e4a2b7be204))
* **macos:** add system module and brew helpers for macOS ([22396bb](https://github.com/ettoreaquino/devlair/commit/22396bb1e1b5b609c0ed59200f16478a16c66a0b))
* **macos:** add system module with brew helpers (PR 2a) ([3556630](https://github.com/ettoreaquino/devlair/commit/3556630ff6a40a77d82c13a4a4bcf1e90344cade))


### Bug Fixes

* **init:** improve stderr heuristic to surface apt root-cause line ([724000a](https://github.com/ettoreaquino/devlair/commit/724000a4bc6918e5ee5b29033ad59e693273edde))
* **init:** prefer first E: line over apt meta-summary in stderr fallback ([534aecc](https://github.com/ettoreaquino/devlair/commit/534aecccad2b4e469a232395b8567d6752296643))
* **macos:** address ssh reviewer findings ([92f0980](https://github.com/ettoreaquino/devlair/commit/92f0980f70799efc97254be56940edc49c1ec5c1))
* **macos:** address timezone reviewer findings ([185be67](https://github.com/ettoreaquino/devlair/commit/185be67b1958c02cfa8ddfb250a4e1acf38b3452))
* **macos:** brew_ensure failure guard, brew check in doctor, drop test comment ([004445c](https://github.com/ettoreaquino/devlair/commit/004445c6309398907bcef40b598d0513ea14ec49))
* **macos:** remove duplicate MACOS_ESSENTIALS comment ([6774bd8](https://github.com/ettoreaquino/devlair/commit/6774bd882b98e788a748a7048125d371585c8c05))
* **security:** remove chmod 644 from download_script ([c845a0a](https://github.com/ettoreaquino/devlair/commit/c845a0adef5370735f3bd21c3cb2431677c75e85))
* **security:** remove world-readable chmod from download_script ([680a736](https://github.com/ettoreaquino/devlair/commit/680a736b5fa0d8eac61b633a80a0c93e810b5fd8))
* **stderr:** drop what-narration from JSDoc, use /i flag on regex ([4f04d6f](https://github.com/ettoreaquino/devlair/commit/4f04d6fe9fbd49287e89dd844b451d78356c9813))

## [2.7.0](https://github.com/ettoreaquino/devlair/compare/v2.6.0...v2.7.0) (2026-06-23)


### Features

* **wizard:** wait for GitHub SSH connection before completing module ([4b90af1](https://github.com/ettoreaquino/devlair/commit/4b90af13e5f3186b67fb1ba6a7bbc639a9d3a4db))
* **wizard:** wait for GitHub SSH connection before completing module ([5e27f98](https://github.com/ettoreaquino/devlair/commit/5e27f98405b898ff2415662523bfe9b75e46b180))


### Bug Fixes

* **cli:** address PR review findings on feat/github-wait-for-connection ([daaa4d3](https://github.com/ettoreaquino/devlair/commit/daaa4d3be1b58e410259e42583b39e004253cb82))

## [2.6.0](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.5.2-alpha.1...devlair-cli-v2.6.0) (2026-06-22)


### Bug Fixes

* **cli:** add -h/--help as explicit flag alias for help command ([4633aec](https://github.com/ettoreaquino/devlair/commit/4633aec805698321181a952e951c1a9ea14e8de2))

## [2.5.2-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.5.1-alpha.1...devlair-cli-v2.5.2-alpha.1) (2026-06-22)


### Bug Fixes

* **cli:** address PR review findings on fix/progress-history-and-warn-status ([0bc4b28](https://github.com/ettoreaquino/devlair/commit/0bc4b2878f4cd31f8f164f1aee6ea7e61df18b3a))
* **init:** accumulate progress history and honour warn status ([2fa24f4](https://github.com/ettoreaquino/devlair/commit/2fa24f48dd27fc5947d3562ef556d665d90229ac))
* **init:** accumulate progress history and honour warn status from modules ([083a4f3](https://github.com/ettoreaquino/devlair/commit/083a4f3c401a30c0a6e4ec095a1baef1c560b53b))
* **init:** fix biome lint errors — array index key and formatter ([435bda4](https://github.com/ettoreaquino/devlair/commit/435bda42da99ab28c723a7ba7fde264d567c97c9))

## [2.5.1-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.5.0-alpha.1...devlair-cli-v2.5.1-alpha.1) (2026-05-18)


### Bug Fixes

* **wizard:** memoize context to prevent run from aborting itself ([1c775b8](https://github.com/ettoreaquino/devlair/commit/1c775b84312daaf36746f19143e8a6c52de46fcc))
* **wizard:** memoize context to prevent run from aborting itself ([9a0137d](https://github.com/ettoreaquino/devlair/commit/9a0137d2f872084205c5d5cb9f97b6925cedc515))

## [2.5.0-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.4.1-alpha.1...devlair-cli-v2.5.0-alpha.1) (2026-05-18)


### Features

* **wizard:** interactive github prompt + untimed tailscale auth ([19b9265](https://github.com/ettoreaquino/devlair/commit/19b9265b378c196aff07cc0847e46f398ed9238b))
* **wizard:** interactive github prompt + untimed tailscale auth ([aab6c3d](https://github.com/ettoreaquino/devlair/commit/aab6c3db41a728e6d1d0d75e8ccb456d016144f5)), closes [#119](https://github.com/ettoreaquino/devlair/issues/119)


### Bug Fixes

* **runner:** await log stream flush before generator returns ([cd0ffd0](https://github.com/ettoreaquino/devlair/commit/cd0ffd0f8f28d8d219e622145f3def4a5bcdddd3))
* **runner:** await log stream flush before generator returns ([514e494](https://github.com/ettoreaquino/devlair/commit/514e4947e493829c957e7fc532c4be680c24e374)), closes [#122](https://github.com/ettoreaquino/devlair/issues/122)

## [2.4.1-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.4.0-alpha.1...devlair-cli-v2.4.1-alpha.1) (2026-05-18)


### Bug Fixes

* **modules:** tailscale set -e abort + AWS CLI key 404 ([7386030](https://github.com/ettoreaquino/devlair/commit/7386030a6827d011e1b97f0f8d2c75b2d6046741))

## [2.4.0-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.3.1-alpha.1...devlair-cli-v2.4.0-alpha.1) (2026-05-17)


### Features

* **init:** persist module stderr to per-run log files ([6467a8c](https://github.com/ettoreaquino/devlair/commit/6467a8c24d7ef74e187c38b4ed7e7b523a446af0))
* **init:** persist module stderr to per-run log files ([8a8670c](https://github.com/ettoreaquino/devlair/commit/8a8670c0c78c09f5ef00c00e19316b18a4f48ddd))


### Bug Fixes

* **cli:** address PR review findings on feat/init-logs ([2dc9b61](https://github.com/ettoreaquino/devlair/commit/2dc9b61dc0393abb5e96a92f6d9d9d857ea53136))

## [2.3.1-alpha.1](https://github.com/ettoreaquino/devlair/compare/devlair-cli-v2.3.0-alpha.1...devlair-cli-v2.3.1-alpha.1) (2026-05-17)


### Bug Fixes

* **modules:** clear tailscale trap on no-URL path; pin pyenv Python to 3.12 ([36bcb93](https://github.com/ettoreaquino/devlair/commit/36bcb939d02398041425b2bcd08b7980de52fe48))
* **modules:** clear tailscale trap on no-URL path; pin pyenv Python to 3.12 ([4511aa6](https://github.com/ettoreaquino/devlair/commit/4511aa60a5d7979ddc60e370eadc70cddaed7e9b))

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
