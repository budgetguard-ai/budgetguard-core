# Security Policy

## Security Features

### Authentication & Authorization
- **Admin API Keys** - All admin endpoints require `X-Admin-Key` header
- **Tenant API Keys** - Per-tenant keys, hashed with bcrypt (cost factor 12)
- **Request Validation** - Input validation on all endpoints
- **Rate Limiting** - Per-tenant rate limiting to prevent abuse

### Data Protection
- **Key Hashing** - Tenant API keys stored as bcrypt hashes (never plaintext)
- **Audit Logging** - All requests logged to immutable `UsageLedger`
- **Environment Isolation** - Secrets managed via environment variables
- **SQL Injection Protection** - Parameterized queries only

## Security Best Practices

### For Administrators

**Strong Admin Keys:**
```bash
# Generate secure admin key
openssl rand -hex 32
```

**Environment Security:**
```bash
# Never commit secrets
echo ".env" >> .gitignore

# Use secure environment variables
export ADMIN_API_KEY="$(openssl rand -hex 32)"
export DB_PASSWORD="$(openssl rand -base64 32)"
```

**Database Security:**
```bash
# Enable SSL connections
export DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"
```

### For Users

**API Key Security:**
- Store keys securely (environment variables, secrets manager)
- Use different keys for different environments
- Never log API keys in application logs
- Rotate keys regularly via admin API

**API Key Rotation:**
```bash
# Create new tenant API key
curl -X POST https://your-domain.com/admin/tenant/1/apikeys \
  -H "X-Admin-Key: $ADMIN_API_KEY"

# Deactivate old key via admin interface
```

## Vulnerability Reporting

### Supported Versions
| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅ Yes    |
| 0.x.x   | ❌ No     |

### How to Report
**Do NOT create public GitHub issues for security vulnerabilities.**

1. Report security issues via GitHub Security Advisories
2. Include: description, reproduction steps, impact assessment
3. We'll respond within 24-72 hours

## Production Hardening

### Required Environment Variables
```bash
NODE_ENV=production
ADMIN_API_KEY="secure-random-key-here"  # Use: openssl rand -hex 32
DATABASE_URL="postgres://user:pass@host:5432/db?sslmode=require"
```

### Network Security
```yaml
# Docker Compose - only expose necessary ports
services:
  api:
    ports:
      - "3000:3000"
    networks:
      - internal

  postgres:
    # Don't expose database externally
    networks:
      - internal
```

### HTTPS Configuration
Use reverse proxy (nginx/traefik) with SSL termination:
```nginx
server {
    listen 443 ssl http2;
    ssl_protocols TLSv1.2 TLSv1.3;
    # Add your SSL certificates
}
```

## Security Monitoring

### Audit Logging
All requests logged to `UsageLedger` table with:
- Tenant ID and model used
- Token counts and costs
- Timestamps and request metadata

### Key Metrics to Monitor
- Request rate per tenant
- Failed authentication attempts  
- Budget utilization rates
- Error rates by endpoint

## Security Limitations

### Known Limitations
1. **AI Provider Security** - Depends on upstream providers
2. **Admin Key Storage** - Stored in environment variable (plaintext)
3. **Network Security** - Requires proper infrastructure configuration
4. **Rate Limiting** - Can be bypassed with multiple tenants

### Security Model
- **Tenant Keys**: Hashed in database, rotated via admin API
- **Admin Keys**: Environment variable, manually managed
- **Provider Keys**: Passed through to AI providers

## Security Tools

```bash
# Dependency scanning
npm audit

# Container scanning  
docker scan budgetguard/core:latest

# Keep dependencies updated
npm audit fix
```

---

**Security is a shared responsibility.** Proper deployment and configuration are essential for a secure installation.