# Contributing Guidelines

## Branch naming
| Type  | Example                     |
|-------|-----------------------------|
| Feature | `feat/rate-limit-redis`    |
| Bugfix  | `fix/redis-conn-error`     |
| Chore   | `chore/ci-workflow`        |
| Docs    | `docs/readme-typo`         |

## Commit message convention
Use the Conventional Commits spec:

- **feat:** A new feature
- **fix:** A bug fix
- **chore:** Build process, tooling, refactor with no user impact
- **docs:** Documentation only changes
- **test:** Adding or correcting tests
- **ci:** CI/CD configuration changes

Format:  
```
<type>(optional scope): <subject>
```
Example: `feat(rate-limit): add tenant-aware limiter`
