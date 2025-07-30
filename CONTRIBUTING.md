# Contributing to BudgetGuard

Thanks for contributing! This guide will help you get started.

## Development Setup

```bash
git clone https://github.com/your-username/budgetguard-core.git
cd budgetguard-core
npm install && npm run setup
```

Edit `.env` with your API keys, then:
```bash
npm run dev      # Start server
npm run worker   # Start worker (separate terminal)
```

## Development Workflow

**Branch naming:**
- `feat/feature-name` - New features
- `fix/bug-name` - Bug fixes  
- `docs/doc-name` - Documentation

**Commit messages:**
```
feat(scope): description
fix(scope): description
docs(scope): description
```

Examples:
```
feat(rate-limit): add tenant-aware rate limiting
fix(redis): handle connection timeout gracefully
docs(api): update endpoint documentation
```

## Testing

```bash
npm test                 # All tests
npm test -- file.test.ts # Specific test
npm run lint            # Linting
```

**Test guidelines:**
- Place tests in `src/__tests__/`
- Mock external dependencies
- Test success and error cases

## Pull Requests

**Before submitting:**
- [ ] Tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Builds successfully (`npm run build`) 
- [ ] Manual testing completed

**PR requirements:**
- Descriptive title following commit convention
- Link related issues with `Fixes #123`
- Include test coverage for new features
- Update documentation if needed

## Code Standards

- Use TypeScript with strict mode
- Run `npm run lint` before committing
- Follow existing code patterns
- Add JSDoc for public APIs
- No `any` types

## Architecture Guidelines

**Adding features:**
- Check existing patterns first
- Use Redis for performance-critical caching
- Handle errors gracefully
- Log important events

**Database changes:**
- Create Prisma migrations
- Update seed data if needed
- Test migration rollbacks

## Bug Reports

Include:
- Clear description and steps to reproduce
- Expected vs actual behavior
- Environment details and logs
- Minimal reproduction example

## Getting Help

- GitHub Issues for bugs/features
- Check existing documentation first
- Be respectful and inclusive

Thank you for contributing! 🎉