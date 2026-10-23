# Security Policy

## Supported versions

Only the latest 3.x release receives security fixes. Upgrade with `devlair upgrade` before reporting.

| Version | Supported |
|---------|-----------|
| 3.x (latest) | Yes |
| < 3.0 | No |

## Reporting a vulnerability

Please do **not** open a public issue for security problems.

Report privately through GitHub: go to the [Security tab](https://github.com/ettoreaquino/devlair/security) and choose **Report a vulnerability**. Include the devlair version, your OS, steps to reproduce, and the impact you expect.

You will get a first response within 14 days. Once a fix ships, the advisory is published with credit to the reporter unless you ask otherwise.

## Scope

devlair runs with elevated privileges to provision machines, so reports about the following are especially welcome:

- The install script or `devlair upgrade` fetching or running unverified code
- Privilege escalation through the bash modules in `cli/modules/`
- Injection through setup profiles, shell configs, or command arguments
- Weaknesses in the release pipeline (`.github/workflows/`)
