# Security Policy

## 🔒 Security Overview

BudgetGuard handles sensitive data including API keys, usage data, and financial information. This document outlines our security practices and how to report security vulnerabilities.

## 🛡️ Security Features

### Authentication & Authorization
- **Admin API Key Protection** - All admin endpoints require `X-Admin-Key` header
- **Tenant API Keys** - Per-tenant API keys for client authentication
- **Request Validation** - Input validation on all endpoints
- **Rate Limiting** - Per-tenant rate limiting to prevent abuse

### Data Protection
- **API Key Encryption** - API keys are hashed before storage
- **Audit Logging** - All requests logged to immutable `UsageLedger`
- **Environment Isolation** - Secrets managed via environment variables
- **Database Security** - Parameterized queries prevent SQL injection

### Infrastructure Security
- **Docker Isolation** - Services run in isolated containers
- **Network Segmentation** - Internal services communicate via private networks
- **Minimal Attack Surface** - Only necessary ports exposed

## 🔐 Security Best Practices

### For Administrators

1. **Strong Admin Keys**
   ```bash
   # Generate secure admin key
   openssl rand -hex 32
   ```

2. **Environment Security**
   ```bash
   # Never commit secrets
   echo ".env" >> .gitignore
   
   # Use secure environment variable management
   export ADMIN_API_KEY="$(openssl rand -hex 32)"
   ```

3. **Database Security**
   ```bash
   # Use strong database passwords
   export DB_PASSWORD="$(openssl rand -base64 32)"
   
   # Enable SSL connections
   export DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"
   ```

4. **Regular Updates**
   ```bash
   # Keep dependencies updated
   npm audit fix
   
   # Update base images
   docker pull node:18-alpine
   ```

### For Developers

1. **Code Security**
   - Never hardcode secrets in source code
   - Use parameterized queries for database access
   - Validate all input data
   - Handle errors gracefully without exposing internals

2. **Dependency Management**
   ```bash
   # Check for vulnerabilities
   npm audit
   
   # Review dependencies before adding
   npm ls --depth=0
   ```

3. **Testing**
   ```bash
   # Run security tests
   npm run test:security  # (when available)
   
   # Test with invalid inputs
   npm run test:fuzzing   # (when available)
   ```

### For Users

1. **API Key Security**
   - Store API keys securely (environment variables, secrets manager)
   - Rotate API keys regularly
   - Use different keys for different environments
   - Never log API keys

2. **Network Security**
   - Use HTTPS for all API calls
   - Implement proper firewall rules
   - Monitor API usage for anomalies

3. **Access Control**
   ```bash
   # Example secure API call
   curl -X POST https://your-budgetguard.com/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $OPENAI_KEY" \
     -H "X-Tenant-Id: your-tenant" \
     -H "X-API-Key: $TENANT_API_KEY" \
     -d '{"model":"gpt-4.1","messages":[{"role":"user","content":"Hello"}]}'
   ```

## 🚨 Vulnerability Reporting

### Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | ✅ Yes             |
| 0.x.x   | ❌ No              |

### How to Report

We take security vulnerabilities seriously. Please follow responsible disclosure:

1. **Do NOT** create public GitHub issues for security vulnerabilities
2. **Email** security reports to: `security@budgetguard.ai`
3. **Include** the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if available)

### Response Timeline

- **24 hours**: Initial response acknowledging receipt
- **72 hours**: Initial vulnerability assessment
- **7 days**: Detailed response with timeline for fix
- **30 days**: Target for security patch release

### Disclosure Policy

- We will acknowledge your contribution if you wish
- We will coordinate disclosure timing with you
- We will provide updates on fix progress
- We may offer recognition in release notes

## 🛠️ Security Configuration

### Production Hardening

1. **Environment Variables**
   ```bash
   # Required security settings
   NODE_ENV=production
   ADMIN_API_KEY="secure-random-key-here"
   
   # Database security
   DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"
   
   # Redis security (if exposed)
   REDIS_URL="redis://user:pass@host:6379"
   ```

2. **Network Security**
   ```yaml
   # Docker Compose example
   services:
     api:
       ports:
         - "3000:3000"  # Only expose necessary ports
       networks:
         - internal     # Use internal networks
     
     postgres:
       # Don't expose database port externally
       networks:
         - internal
   ```

3. **HTTPS Configuration**
   ```nginx
   # Nginx SSL configuration
   server {
       listen 443 ssl http2;
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       ssl_protocols TLSv1.2 TLSv1.3;
       ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
       
       location / {
           proxy_pass http://budgetguard-api:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

### Security Headers

Add these headers for enhanced security:

```javascript
// Example Fastify security headers
app.register(require('@fastify/helmet'), {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
});
```

## 🔍 Security Monitoring

### Audit Logging

All requests are logged to the `UsageLedger` table:

```sql
-- Example audit log query
SELECT 
  tenant_id,
  model,
  input_tokens,
  output_tokens,
  cost_usd,
  created_at
FROM "UsageLedger"
WHERE tenant_id = 'suspicious-tenant'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Anomaly Detection

Monitor for unusual patterns:

```bash
# High usage from single tenant
# Unusual request patterns
# Failed authentication attempts
# Budget threshold breaches
```

### Security Metrics

Key metrics to monitor:

- Request rate per tenant
- Failed authentication attempts
- Budget utilization rates
- Error rates by endpoint
- Database connection patterns

## 🚫 Security Limitations

### Known Limitations

1. **AI Provider Security** - Security depends on upstream AI providers
2. **Network Security** - Requires proper network configuration
3. **Key Management** - Users responsible for secure key storage
4. **Rate Limiting** - Can be bypassed with multiple tenants

### Assumptions

- Users will secure their API keys properly
- Network infrastructure is properly configured
- Database and Redis are secured at infrastructure level
- Regular security updates will be applied

## 📚 Security Resources

### External Security Guides

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Docker Security](https://docs.docker.com/engine/security/)
- [PostgreSQL Security](https://www.postgresql.org/docs/current/security.html)

### Security Tools

```bash
# Dependency scanning
npm audit

# Container scanning
docker scan budgetguard/core:latest

# Static analysis
npx eslint . --ext .ts

# Environment validation
npx dotenv-vault audit
```

## 📞 Security Contacts

- **Security Email**: security@budgetguard.ai
- **General Contact**: support@budgetguard.ai
- **GitHub Issues**: For non-security bugs only

---

**Remember**: Security is a shared responsibility. While we work hard to secure BudgetGuard, proper deployment and configuration are essential for a secure installation.