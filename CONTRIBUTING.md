# Contributing to BudgetGuard

Thank you for your interest in contributing to BudgetGuard! This guide will help you get started with contributing to the project.

## 🚀 Quick Start for Contributors

### Prerequisites
- Node.js 18+ 
- Docker and Docker Compose
- Git

### Setting Up Development Environment

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/your-username/budgetguard-core.git
   cd budgetguard-core
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

4. **Build OPA policy bundle**
   ```bash
   bash scripts/build-opa-wasm.sh
   ```

5. **Start development infrastructure**
   ```bash
   docker compose up -d postgres redis
   ```

6. **Run database migrations and seed data**
   ```bash
   npx prisma migrate dev
   npm run seed
   ```

7. **Start the development server**
   ```bash
   npm run dev
   ```

8. **Start the worker (in separate terminal)**
   ```bash
   npm run worker
   ```

## 🔧 Development Workflow

### Branch Naming Convention
| Type    | Example                     | Description                    |
|---------|-----------------------------|---------------------------------|
| Feature | `feat/rate-limit-redis`     | New functionality              |
| Bugfix  | `fix/redis-conn-error`      | Bug fixes                      |
| Chore   | `chore/ci-workflow`         | Build/tooling updates          |
| Docs    | `docs/readme-typo`          | Documentation updates          |
| Refactor| `refactor/provider-cleanup` | Code refactoring               |

### Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/) specification:

**Format:**
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- **feat:** A new feature
- **fix:** A bug fix
- **docs:** Documentation only changes
- **style:** Code style changes (formatting, missing semi colons, etc.)
- **refactor:** Code refactoring without functionality changes
- **test:** Adding or correcting tests
- **chore:** Build process, tooling, or dependency updates
- **ci:** CI/CD configuration changes

**Examples:**
```
feat(rate-limit): add tenant-aware rate limiting
fix(redis): handle connection timeout gracefully
docs(api): update endpoint documentation with examples
test(budget): add integration tests for budget enforcement
feat(models): add support for gpt-4.1 and claude-3-5-haiku-latest
```

## 🧪 Testing Guidelines

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- budget.test.ts

# Run tests in watch mode
npm test -- --watch
```

### Test Structure
- **Unit tests**: Test individual functions and components
- **Integration tests**: Test API endpoints and database interactions
- **Provider tests**: Test AI provider integrations

### Writing Tests
- Place tests in `src/__tests__/` directory
- Use descriptive test names
- Mock external dependencies
- Test both success and error cases
- Include edge cases

**Example test structure:**
```typescript
describe('Budget enforcement', () => {
  it('should block requests when budget exceeded', async () => {
    // Test implementation
  });

  it('should allow requests when under budget', async () => {
    // Test implementation
  });
});
```

## 📝 Code Standards

### TypeScript Guidelines
- Use strict TypeScript configuration
- Define proper types for all functions and variables
- Avoid `any` types
- Use meaningful variable and function names

### Code Style
- Run `npm run lint` before committing
- Follow existing code patterns
- Use async/await over promises
- Add JSDoc comments for public APIs

### File Organization
```
src/
├── __tests__/          # Test files
├── providers/          # AI provider implementations
├── policy/            # OPA policy files
├── dashboard/         # Dashboard React app
├── server.ts          # Main server file
├── worker.ts          # Background worker
└── types.ts           # Type definitions
```

## 🔍 Pull Request Process

### Before Submitting
1. **Ensure tests pass**: `npm test`
2. **Run linting**: `npm run lint`
3. **Build successfully**: `npm run build`
4. **Update documentation** if needed
5. **Test manually** with real API calls

### PR Guidelines
1. **Create descriptive title** following conventional commit format
2. **Fill out PR template** completely
3. **Link related issues** using `Fixes #123` or `Closes #123`
4. **Add screenshots** for UI changes
5. **Include test coverage** for new features

### PR Template Elements
- [ ] Description of changes
- [ ] Testing performed
- [ ] Documentation updated
- [ ] Breaking changes noted
- [ ] Screenshots (if applicable)

## 🏗️ Architecture Guidelines

### Adding New Features
1. **Check existing patterns** in the codebase
2. **Follow provider interface** for AI provider integrations
3. **Use Redis for caching** performance-critical data
4. **Log important events** for debugging
5. **Handle errors gracefully** with proper error responses

### Database Changes
1. **Create migrations** using Prisma
2. **Update seed data** if needed
3. **Test migration rollbacks**
4. **Document schema changes**

### API Endpoints
1. **Follow RESTful conventions**
2. **Use consistent error handling**
3. **Add input validation**
4. **Include OpenAPI documentation**
5. **Test with different tenant contexts**

## 🐛 Bug Reports

When reporting bugs, please include:
- **Clear description** of the issue
- **Steps to reproduce** the problem
- **Expected vs actual behavior**
- **Environment details** (OS, Node.js version, etc.)
- **Log outputs** if available
- **Minimal reproduction example**

## 💡 Feature Requests

For new features:
- **Check existing issues** to avoid duplicates
- **Describe the use case** clearly
- **Explain the problem** it solves
- **Consider implementation complexity**
- **Discuss in issues** before starting work

## 📋 Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or request
- `documentation`: Improvements to docs
- `good first issue`: Good for newcomers
- `help wanted`: Extra attention is needed
- `priority-high`: Urgent issues

## 🤝 Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/) code of conduct. Please be respectful and inclusive in all interactions.

## 🔗 Getting Help

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For questions and general discussion
- **Documentation**: Check existing docs first

Thank you for contributing to BudgetGuard! 🎉