# Changelog

## [1.6.1](https://github.com/ettoreaquino/devlair/compare/v1.6.0...v1.6.1) (2026-04-07)


### Bug Fixes

* **upgrade:** apt non-fatal + install Claude Code via native installer ([#35](https://github.com/ettoreaquino/devlair/issues/35)) ([5680993](https://github.com/ettoreaquino/devlair/commit/568099338efc76549967bcccbe7e716329c81091))

## [1.6.0](https://github.com/ettoreaquino/devlair/compare/v1.5.0...v1.6.0) (2026-04-07)


### Features

* **cli:** branded header, README overhaul, upgrade self-update ([#32](https://github.com/ettoreaquino/devlair/issues/32)) ([2897a95](https://github.com/ettoreaquino/devlair/commit/2897a951f129c271f7cae5d954e9281a598c0406))

## [1.5.0](https://github.com/ettoreaquino/devlair/compare/v1.4.2...v1.5.0) (2026-04-06)


### Features

* **wsl:** redirect browser to Windows via wslview ([#29](https://github.com/ettoreaquino/devlair/issues/29)) ([f59ca30](https://github.com/ettoreaquino/devlair/commit/f59ca30dc039841accc9713f6e646071da6fe3a2))

## [1.4.2](https://github.com/ettoreaquino/devlair/compare/v1.4.1...v1.4.2) (2026-04-06)


### Bug Fixes

* **init:** make rclone opt-in and AWS CLI GPG non-fatal ([#26](https://github.com/ettoreaquino/devlair/issues/26)) ([5ba372a](https://github.com/ettoreaquino/devlair/commit/5ba372a4578693c4f46f68d0d570aa0845f89eb0))

## [1.4.1](https://github.com/ettoreaquino/devlair/compare/v1.4.0...v1.4.1) (2026-04-06)


### Bug Fixes

* **wsl:** UTF-8 rendering, GPG fallback, and upgrade opt-in guards ([#23](https://github.com/ettoreaquino/devlair/issues/23)) ([c06f533](https://github.com/ettoreaquino/devlair/commit/c06f533768994a5b1d710485ab8ebb09b3cdff0f))

## [1.4.0](https://github.com/ettoreaquino/devlair/compare/v1.3.2...v1.4.0) (2026-04-06)


### Features

* **wsl:** opt-in modules, Docker prerequisite, and permission fixes ([#19](https://github.com/ettoreaquino/devlair/issues/19)) ([d0676d2](https://github.com/ettoreaquino/devlair/commit/d0676d20c378eb936cce989325e52b15b2ad618e))

## [1.3.2](https://github.com/ettoreaquino/devlair/compare/v1.3.1...v1.3.2) (2026-04-06)


### Bug Fixes

* **install:** set 755 permissions on installed binary ([6015bab](https://github.com/ettoreaquino/devlair/commit/6015babe7d3a96632015ec94568fdcca74691047))

## [1.3.1](https://github.com/ettoreaquino/devlair/compare/v1.3.0...v1.3.1) (2026-04-06)


### Bug Fixes

* **install:** replace python3 dependency with grep for tag parsing ([c3f3d71](https://github.com/ettoreaquino/devlair/commit/c3f3d71316cf45403f460805320da245fd8f6aca))

## [1.3.0](https://github.com/ettoreaquino/devlair/compare/v1.2.0...v1.3.0) (2026-04-06)


### Features

* add brand identity, GitHub infrastructure, and v1.0.0 release prep ([bea87f0](https://github.com/ettoreaquino/devlair/commit/bea87f029d9d8bbca70644c5bc8632565452fcc1))
* add brand identity, GitHub infrastructure, and v1.0.0 release prep ([a08fdae](https://github.com/ettoreaquino/devlair/commit/a08fdae2ab7b0260b74105a38fa2929a402a346b))
* auto-elevate to root instead of requiring sudo prefix ([812b79b](https://github.com/ettoreaquino/devlair/commit/812b79baf6fb32932a02c78b48463ae214b58701))
* **claude,shell,tmux:** align dashboard to Anthropic reset windows, enhance banner and copy mode ([43ab33f](https://github.com/ettoreaquino/devlair/commit/43ab33fe60051d6047a13b6f65b7910303a5ac32))
* **claude:** add Claude Code module, dashboard, and tmux integration ([673275c](https://github.com/ettoreaquino/devlair/commit/673275c948ae9c8eb3cde8e9153e694c45b994eb))
* **claude:** add Telegram channel integration ([fbec969](https://github.com/ettoreaquino/devlair/commit/fbec9698e26fb0e8a9d4ea0e16098c1f8ac1b698))
* **claude:** auto-install Telegram plugin during init/upgrade ([ee13b09](https://github.com/ettoreaquino/devlair/commit/ee13b09ad100f6586729759f8251d965e341d3a0))
* **claude:** rewrite dashboard with global usage and plan-based percentages ([1c89525](https://github.com/ettoreaquino/devlair/commit/1c895257916fb74713f33d0fbe8fac7f766bbe28))
* **claw:** add PicoCLAW WhatsApp agent module ([ea0db68](https://github.com/ettoreaquino/devlair/commit/ea0db681194a500192c0e67bc591e4ba3066488a))
* initial devlair scaffold ([9cac8b9](https://github.com/ettoreaquino/devlair/commit/9cac8b933ffc14a4583c7028ec4931a927ec8b0b))
* **modules:** add group registry, dependency graph, and --group filter ([61c1748](https://github.com/ettoreaquino/devlair/commit/61c1748f3444c65d861a4bdc8805c779fa842f6b))
* **modules:** add group registry, dependency graph, and --group filter ([bf61707](https://github.com/ettoreaquino/devlair/commit/bf617073223e5d2ba7e91a0cb74f4743c86db446))
* **platform:** add WSL detection and smart-skip incompatible modules ([3235d7d](https://github.com/ettoreaquino/devlair/commit/3235d7dc577c234b426d0eee3e100d0e4a0ae684)), closes [#5](https://github.com/ettoreaquino/devlair/issues/5)
* **profile:** YAML profile loading and --config flag ([#12](https://github.com/ettoreaquino/devlair/issues/12)) ([e37c85d](https://github.com/ettoreaquino/devlair/commit/e37c85d44378dc4f7bc60e9b0a1beb55397a9315))
* **rclone:** add rclone installation and devlair sync command ([b1016f4](https://github.com/ettoreaquino/devlair/commit/b1016f4cd63a07af68a6363bc4b408ef96f24cd2))
* rename update to upgrade and add doctor --fix ([9297084](https://github.com/ettoreaquino/devlair/commit/929708482ae8cabbd3a207ff7185540ac00767f2))
* **security:** harden installs, add audit logging, verify checksums ([#13](https://github.com/ettoreaquino/devlair/issues/13)) ([cfcf9ba](https://github.com/ettoreaquino/devlair/commit/cfcf9ba1b409ee66e79b383f7a4563cacaf25020))
* **shell,tmux:** add tmux-continuum auto-restore and simplify login banner ([ebdac10](https://github.com/ettoreaquino/devlair/commit/ebdac102983974bc8c601b7e9f9372e7e10e25f5))
* **shell:** add tmx new subcommand with named claude-telegram sessions ([0dfbfa2](https://github.com/ettoreaquino/devlair/commit/0dfbfa2441ad41ea1312a6670d04943d08b99f7b))
* **shell:** add tmx shortcut for tmux session attach ([4cacf93](https://github.com/ettoreaquino/devlair/commit/4cacf935da47c0620557d6839095fb6f3c70deec))
* **sync:** add --remove option and synced drives login banner ([7b24a56](https://github.com/ettoreaquino/devlair/commit/7b24a56741cb5f37de54866ae215a91bd0292431))
* **tmux:** add TPM, tmux-resurrect, and Claude Code popup ([1eabb47](https://github.com/ettoreaquino/devlair/commit/1eabb474d36e0aa14cd1128f7630e0774a037e8a))
* **tmux:** show git branch in status bar ([ddb5e43](https://github.com/ettoreaquino/devlair/commit/ddb5e43e88180edd4715aa6050e6007d2b9cc0d3))
* **upgrade:** install bun when missing; fix banner phone count ([34a5c62](https://github.com/ettoreaquino/devlair/commit/34a5c62831e81e87b9a6b2dd64162e884043935c))


### Bug Fixes

* centralize sudo elevation with graceful error handling ([4d84e34](https://github.com/ettoreaquino/devlair/commit/4d84e34656219ec593f89dd1c5ce53759273e1e2))
* **ci:** allow merge and revert commits in conventional commit check ([55e3688](https://github.com/ettoreaquino/devlair/commit/55e3688a8d6e31d659e8c2d9ace23e8e23f139ff))
* **ci:** create release before matrix build jobs to avoid race condition ([17a62c6](https://github.com/ettoreaquino/devlair/commit/17a62c622ee73abea080cad13cafdfb8426b7e02))
* **ci:** rename release-please config to match v4 default path ([192112b](https://github.com/ettoreaquino/devlair/commit/192112b152bccad2e7bda0b86373abb628b059a1))
* **ci:** use PEP 440 compliant dev version and stamp before uv sync ([d9560c2](https://github.com/ettoreaquino/devlair/commit/d9560c2f1cc82dfe8b3cc898197f33abf12ac5ca))
* **claude:** add ~/.devlair/bin to PATH and drop .sh from wrapper name ([dde50d3](https://github.com/ettoreaquino/devlair/commit/dde50d3ca9541cac3a26499b55e8c203de2b1fee))
* **claude:** recalibrate plan budget estimates from dashboard data ([b01cff3](https://github.com/ettoreaquino/devlair/commit/b01cff38a1cd2c8437a912b423f3b0fad33a5d3c))
* **claw:** add PostgreSQL backend for Evolution API ([9b9e1a7](https://github.com/ettoreaquino/devlair/commit/9b9e1a743f9e169c273643cecaeb59e744f1d164))
* correct ufw and fail2ban check commands ([17c94e6](https://github.com/ettoreaquino/devlair/commit/17c94e6d92a2ef9cdc71009dbbf80bfcc36d943b))
* **doctor:** add devtools to reapply keys and fix claw banner layout ([ccf4f6a](https://github.com/ettoreaquino/devlair/commit/ccf4f6a09ea87c82e7ceb1f65ff2f50f7ca1c4f1))
* install Python LTS via pyenv and fix nvm PROFILE export ([0e3c9a0](https://github.com/ettoreaquino/devlair/commit/0e3c9a0a27962158041f2701a67e384fd8b1f0c5))
* load zimfw init.zsh so Dracula prompt actually renders ([ab92eae](https://github.com/ettoreaquino/devlair/commit/ab92eae7c1313a16cacdd3ff3548a7802c340c2e))
* **platform:** handle macOS label, eliminate redundant calls ([f852dbb](https://github.com/ettoreaquino/devlair/commit/f852dbb92d1d9e17a7b137df6666147dbf324cc0))
* quiet all subprocess output during init for clean CLI experience ([d4760f1](https://github.com/ettoreaquino/devlair/commit/d4760f15791158ba4c2f2833722eb5b22a4eb249))
* **rclone:** install rclone on demand and resolve binary path in subshell ([e899bd3](https://github.com/ettoreaquino/devlair/commit/e899bd32f9ed83a375682d10aa8830b4764c58cd))
* **release:** correct tag format, URL construction, and build trigger ([d711416](https://github.com/ettoreaquino/devlair/commit/d7114166059e7e60125904f719d917cc564b4ca6))
* remove spinner wrapping module execution to unblock interactive prompts ([a390903](https://github.com/ettoreaquino/devlair/commit/a39090310c6674dd4c86e33714ec204427222058))
* **review:** address PR [#1](https://github.com/ettoreaquino/devlair/issues/1) review feedback ([58d1c90](https://github.com/ettoreaquino/devlair/commit/58d1c900b9fc13a3182129294268daca6ee01e4a))
* self-update checks installed binary version and skips dev installs ([7e0b2bb](https://github.com/ettoreaquino/devlair/commit/7e0b2bbce6505cc961a28c7f4a3404ed21f54cc4))
* self-update installs to /usr/local/bin instead of replacing sys.executable ([5b67c51](https://github.com/ettoreaquino/devlair/commit/5b67c51840f6fe8f726d8508f322af0df7ba1bb6))
* set DBUS_SESSION_BUS_ADDRESS for dconf writes in gnome_terminal module ([b39a888](https://github.com/ettoreaquino/devlair/commit/b39a8881c9356c6a69944e25b04e0ace2086ffbb))
* shell module cleans third-party installer pollution from .zshrc ([0b3f1d6](https://github.com/ettoreaquino/devlair/commit/0b3f1d664fe04eb0bea10a54b182c423ea66460b))
* **shell:** add ~/.bun/bin to PATH in zshrc aliases block ([877b9a9](https://github.com/ettoreaquino/devlair/commit/877b9a9e6df52b077186a76bd7f62c83b85051cf))
* **shell:** escape \~ in zsh substitution; add syntax lint gate ([92f5595](https://github.com/ettoreaquino/devlair/commit/92f559576e5695de8b3389b9aa53b5cb83ccc14c))
* **shell:** escape backslash-space in case pattern to silence SyntaxWarning ([eb2ab02](https://github.com/ettoreaquino/devlair/commit/eb2ab02c0477340111bfb4547137b9d142b79bf6))
* **shell:** rename cat alias to bcat to avoid breaking heredocs ([e696466](https://github.com/ettoreaquino/devlair/commit/e69646616bea4748c36e94116247c282631ec5f4))
* **sync:** require user-chosen sync name instead of deriving from remote path ([eafda5d](https://github.com/ettoreaquino/devlair/commit/eafda5d5e456aadafc94e181714aecc1aa53d487))
* **sync:** rollback systemd units when initial bisync fails ([3859d59](https://github.com/ettoreaquino/devlair/commit/3859d5961ce74722320a8d7b1bb8c3bdb3716045))
* **tmux,sync:** fix session persistence, clipboard, and switch to bisync ([2db1a43](https://github.com/ettoreaquino/devlair/commit/2db1a430874b4e11c9d9492cd8a658a18f4208f7))
* update command now refreshes pyenv/Python and nvm/Node ([502fb0d](https://github.com/ettoreaquino/devlair/commit/502fb0d43b37b62fe2c71282eca4bfafb79ffc3d))
* **upgrade:** fix indentation error in rclone timer status block ([33249b7](https://github.com/ettoreaquino/devlair/commit/33249b75c4684c674278917f9da45b1ceb5f33fe))


### Documentation

* add issue linking to PR template and release process ([fa4f3a6](https://github.com/ettoreaquino/devlair/commit/fa4f3a64af74d5aa85cf98ed67a52f423b23b2c6))
* add issue linking to PR template and release process ([1773b2f](https://github.com/ettoreaquino/devlair/commit/1773b2fdf08df0219b1478501debae0ceef69abc))
* add project board workflow to SDLC documentation ([748cbef](https://github.com/ettoreaquino/devlair/commit/748cbefb83eca1d471ce96ef8073be267bd5131e))
* fix tmux popup keybinding and add copy-mode to README ([20e1fe7](https://github.com/ettoreaquino/devlair/commit/20e1fe7a492f9ed8e7bf866e949174a7508348b9))
* rewrite README with badges, module docs, and project structure ([41f6a63](https://github.com/ettoreaquino/devlair/commit/41f6a635056501028789028a6889d4c6616bbc1e))
* update context.py description in project structure ([f566535](https://github.com/ettoreaquino/devlair/commit/f566535dbf2b7e216e12a1a0458e268132f6f680))

## [1.2.0](https://github.com/ettoreaquino/devlair/compare/devlair-v1.1.0...devlair-v1.2.0) (2026-04-06)


### Features

* add brand identity, GitHub infrastructure, and v1.0.0 release prep ([bea87f0](https://github.com/ettoreaquino/devlair/commit/bea87f029d9d8bbca70644c5bc8632565452fcc1))
* add brand identity, GitHub infrastructure, and v1.0.0 release prep ([a08fdae](https://github.com/ettoreaquino/devlair/commit/a08fdae2ab7b0260b74105a38fa2929a402a346b))
* auto-elevate to root instead of requiring sudo prefix ([812b79b](https://github.com/ettoreaquino/devlair/commit/812b79baf6fb32932a02c78b48463ae214b58701))
* **claude,shell,tmux:** align dashboard to Anthropic reset windows, enhance banner and copy mode ([43ab33f](https://github.com/ettoreaquino/devlair/commit/43ab33fe60051d6047a13b6f65b7910303a5ac32))
* **claude:** add Claude Code module, dashboard, and tmux integration ([673275c](https://github.com/ettoreaquino/devlair/commit/673275c948ae9c8eb3cde8e9153e694c45b994eb))
* **claude:** add Telegram channel integration ([fbec969](https://github.com/ettoreaquino/devlair/commit/fbec9698e26fb0e8a9d4ea0e16098c1f8ac1b698))
* **claude:** auto-install Telegram plugin during init/upgrade ([ee13b09](https://github.com/ettoreaquino/devlair/commit/ee13b09ad100f6586729759f8251d965e341d3a0))
* **claude:** rewrite dashboard with global usage and plan-based percentages ([1c89525](https://github.com/ettoreaquino/devlair/commit/1c895257916fb74713f33d0fbe8fac7f766bbe28))
* **claw:** add PicoCLAW WhatsApp agent module ([ea0db68](https://github.com/ettoreaquino/devlair/commit/ea0db681194a500192c0e67bc591e4ba3066488a))
* initial devlair scaffold ([9cac8b9](https://github.com/ettoreaquino/devlair/commit/9cac8b933ffc14a4583c7028ec4931a927ec8b0b))
* **modules:** add group registry, dependency graph, and --group filter ([61c1748](https://github.com/ettoreaquino/devlair/commit/61c1748f3444c65d861a4bdc8805c779fa842f6b))
* **modules:** add group registry, dependency graph, and --group filter ([bf61707](https://github.com/ettoreaquino/devlair/commit/bf617073223e5d2ba7e91a0cb74f4743c86db446))
* **platform:** add WSL detection and smart-skip incompatible modules ([3235d7d](https://github.com/ettoreaquino/devlair/commit/3235d7dc577c234b426d0eee3e100d0e4a0ae684)), closes [#5](https://github.com/ettoreaquino/devlair/issues/5)
* **profile:** YAML profile loading and --config flag ([#12](https://github.com/ettoreaquino/devlair/issues/12)) ([e37c85d](https://github.com/ettoreaquino/devlair/commit/e37c85d44378dc4f7bc60e9b0a1beb55397a9315))
* **rclone:** add rclone installation and devlair sync command ([b1016f4](https://github.com/ettoreaquino/devlair/commit/b1016f4cd63a07af68a6363bc4b408ef96f24cd2))
* rename update to upgrade and add doctor --fix ([9297084](https://github.com/ettoreaquino/devlair/commit/929708482ae8cabbd3a207ff7185540ac00767f2))
* **security:** harden installs, add audit logging, verify checksums ([#13](https://github.com/ettoreaquino/devlair/issues/13)) ([cfcf9ba](https://github.com/ettoreaquino/devlair/commit/cfcf9ba1b409ee66e79b383f7a4563cacaf25020))
* **shell,tmux:** add tmux-continuum auto-restore and simplify login banner ([ebdac10](https://github.com/ettoreaquino/devlair/commit/ebdac102983974bc8c601b7e9f9372e7e10e25f5))
* **shell:** add tmx new subcommand with named claude-telegram sessions ([0dfbfa2](https://github.com/ettoreaquino/devlair/commit/0dfbfa2441ad41ea1312a6670d04943d08b99f7b))
* **shell:** add tmx shortcut for tmux session attach ([4cacf93](https://github.com/ettoreaquino/devlair/commit/4cacf935da47c0620557d6839095fb6f3c70deec))
* **sync:** add --remove option and synced drives login banner ([7b24a56](https://github.com/ettoreaquino/devlair/commit/7b24a56741cb5f37de54866ae215a91bd0292431))
* **tmux:** add TPM, tmux-resurrect, and Claude Code popup ([1eabb47](https://github.com/ettoreaquino/devlair/commit/1eabb474d36e0aa14cd1128f7630e0774a037e8a))
* **tmux:** show git branch in status bar ([ddb5e43](https://github.com/ettoreaquino/devlair/commit/ddb5e43e88180edd4715aa6050e6007d2b9cc0d3))
* **upgrade:** install bun when missing; fix banner phone count ([34a5c62](https://github.com/ettoreaquino/devlair/commit/34a5c62831e81e87b9a6b2dd64162e884043935c))


### Bug Fixes

* centralize sudo elevation with graceful error handling ([4d84e34](https://github.com/ettoreaquino/devlair/commit/4d84e34656219ec593f89dd1c5ce53759273e1e2))
* **ci:** allow merge and revert commits in conventional commit check ([55e3688](https://github.com/ettoreaquino/devlair/commit/55e3688a8d6e31d659e8c2d9ace23e8e23f139ff))
* **ci:** create release before matrix build jobs to avoid race condition ([17a62c6](https://github.com/ettoreaquino/devlair/commit/17a62c622ee73abea080cad13cafdfb8426b7e02))
* **ci:** rename release-please config to match v4 default path ([192112b](https://github.com/ettoreaquino/devlair/commit/192112b152bccad2e7bda0b86373abb628b059a1))
* **ci:** use PEP 440 compliant dev version and stamp before uv sync ([d9560c2](https://github.com/ettoreaquino/devlair/commit/d9560c2f1cc82dfe8b3cc898197f33abf12ac5ca))
* **claude:** add ~/.devlair/bin to PATH and drop .sh from wrapper name ([dde50d3](https://github.com/ettoreaquino/devlair/commit/dde50d3ca9541cac3a26499b55e8c203de2b1fee))
* **claude:** recalibrate plan budget estimates from dashboard data ([b01cff3](https://github.com/ettoreaquino/devlair/commit/b01cff38a1cd2c8437a912b423f3b0fad33a5d3c))
* **claw:** add PostgreSQL backend for Evolution API ([9b9e1a7](https://github.com/ettoreaquino/devlair/commit/9b9e1a743f9e169c273643cecaeb59e744f1d164))
* correct ufw and fail2ban check commands ([17c94e6](https://github.com/ettoreaquino/devlair/commit/17c94e6d92a2ef9cdc71009dbbf80bfcc36d943b))
* **doctor:** add devtools to reapply keys and fix claw banner layout ([ccf4f6a](https://github.com/ettoreaquino/devlair/commit/ccf4f6a09ea87c82e7ceb1f65ff2f50f7ca1c4f1))
* install Python LTS via pyenv and fix nvm PROFILE export ([0e3c9a0](https://github.com/ettoreaquino/devlair/commit/0e3c9a0a27962158041f2701a67e384fd8b1f0c5))
* load zimfw init.zsh so Dracula prompt actually renders ([ab92eae](https://github.com/ettoreaquino/devlair/commit/ab92eae7c1313a16cacdd3ff3548a7802c340c2e))
* **platform:** handle macOS label, eliminate redundant calls ([f852dbb](https://github.com/ettoreaquino/devlair/commit/f852dbb92d1d9e17a7b137df6666147dbf324cc0))
* quiet all subprocess output during init for clean CLI experience ([d4760f1](https://github.com/ettoreaquino/devlair/commit/d4760f15791158ba4c2f2833722eb5b22a4eb249))
* **rclone:** install rclone on demand and resolve binary path in subshell ([e899bd3](https://github.com/ettoreaquino/devlair/commit/e899bd32f9ed83a375682d10aa8830b4764c58cd))
* remove spinner wrapping module execution to unblock interactive prompts ([a390903](https://github.com/ettoreaquino/devlair/commit/a39090310c6674dd4c86e33714ec204427222058))
* **review:** address PR [#1](https://github.com/ettoreaquino/devlair/issues/1) review feedback ([58d1c90](https://github.com/ettoreaquino/devlair/commit/58d1c900b9fc13a3182129294268daca6ee01e4a))
* self-update checks installed binary version and skips dev installs ([7e0b2bb](https://github.com/ettoreaquino/devlair/commit/7e0b2bbce6505cc961a28c7f4a3404ed21f54cc4))
* self-update installs to /usr/local/bin instead of replacing sys.executable ([5b67c51](https://github.com/ettoreaquino/devlair/commit/5b67c51840f6fe8f726d8508f322af0df7ba1bb6))
* set DBUS_SESSION_BUS_ADDRESS for dconf writes in gnome_terminal module ([b39a888](https://github.com/ettoreaquino/devlair/commit/b39a8881c9356c6a69944e25b04e0ace2086ffbb))
* shell module cleans third-party installer pollution from .zshrc ([0b3f1d6](https://github.com/ettoreaquino/devlair/commit/0b3f1d664fe04eb0bea10a54b182c423ea66460b))
* **shell:** add ~/.bun/bin to PATH in zshrc aliases block ([877b9a9](https://github.com/ettoreaquino/devlair/commit/877b9a9e6df52b077186a76bd7f62c83b85051cf))
* **shell:** escape \~ in zsh substitution; add syntax lint gate ([92f5595](https://github.com/ettoreaquino/devlair/commit/92f559576e5695de8b3389b9aa53b5cb83ccc14c))
* **shell:** escape backslash-space in case pattern to silence SyntaxWarning ([eb2ab02](https://github.com/ettoreaquino/devlair/commit/eb2ab02c0477340111bfb4547137b9d142b79bf6))
* **shell:** rename cat alias to bcat to avoid breaking heredocs ([e696466](https://github.com/ettoreaquino/devlair/commit/e69646616bea4748c36e94116247c282631ec5f4))
* **sync:** require user-chosen sync name instead of deriving from remote path ([eafda5d](https://github.com/ettoreaquino/devlair/commit/eafda5d5e456aadafc94e181714aecc1aa53d487))
* **sync:** rollback systemd units when initial bisync fails ([3859d59](https://github.com/ettoreaquino/devlair/commit/3859d5961ce74722320a8d7b1bb8c3bdb3716045))
* **tmux,sync:** fix session persistence, clipboard, and switch to bisync ([2db1a43](https://github.com/ettoreaquino/devlair/commit/2db1a430874b4e11c9d9492cd8a658a18f4208f7))
* update command now refreshes pyenv/Python and nvm/Node ([502fb0d](https://github.com/ettoreaquino/devlair/commit/502fb0d43b37b62fe2c71282eca4bfafb79ffc3d))
* **upgrade:** fix indentation error in rclone timer status block ([33249b7](https://github.com/ettoreaquino/devlair/commit/33249b75c4684c674278917f9da45b1ceb5f33fe))


### Documentation

* add issue linking to PR template and release process ([fa4f3a6](https://github.com/ettoreaquino/devlair/commit/fa4f3a64af74d5aa85cf98ed67a52f423b23b2c6))
* add issue linking to PR template and release process ([1773b2f](https://github.com/ettoreaquino/devlair/commit/1773b2fdf08df0219b1478501debae0ceef69abc))
* add project board workflow to SDLC documentation ([748cbef](https://github.com/ettoreaquino/devlair/commit/748cbefb83eca1d471ce96ef8073be267bd5131e))
* fix tmux popup keybinding and add copy-mode to README ([20e1fe7](https://github.com/ettoreaquino/devlair/commit/20e1fe7a492f9ed8e7bf866e949174a7508348b9))
* rewrite README with badges, module docs, and project structure ([41f6a63](https://github.com/ettoreaquino/devlair/commit/41f6a635056501028789028a6889d4c6616bbc1e))
* update context.py description in project structure ([f566535](https://github.com/ettoreaquino/devlair/commit/f566535dbf2b7e216e12a1a0458e268132f6f680))
