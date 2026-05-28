# Security Guidelines

Security best practices and policies for PR-Agent development and operations.

## Table of Contents
1. Authentication & Authorization
2. Data Protection
3. API Security
4. Infrastructure Security
5. Dependency Management
6. Secrets Management
7. Incident Response
8. Compliance

---

## 1. Authentication & Authorization

### Password Policy

- **Minimum length:** 12 characters
- **Complexity:** Must contain uppercase, lowercase, numbers, symbols
- **Expiration:** 90 days
- **History:** Cannot reuse last 5 passwords
- **Lockout:** 5 failed attempts = 30 min lockout

### Session Management

- **Session timeout:** 24 hours
- **Idle timeout:** 30 minutes
- **Concurrent sessions:** Max 5 per user
- **Session renewal:** Automatic on activity
- **Secure cookies:** httpOnly, secure, sameSite=strict

### Multi-Factor Authentication (MFA)

- **Requirement:** Mandatory for admin accounts
- **Methods:** TOTP (preferred), backup codes
- **Backup codes:** 10 single-use codes, stored encrypted
- **Recovery:** Admin bypass with audit log

### Authorization

- **Principle:** Least privilege
- **Roles:** User, Moderator, Admin
- **Permission model:** Resource-based ACL
- **API scopes:** Read, Write, Delete, Admin
- **Audit logging:** All permission changes logged

---

## 2. Data Protection

### Encryption at Rest

- **Algorithm:** AES-256-GCM
- **Key storage:** Environment variables (rotated quarterly)
- **Sensitive fields:** API keys, tokens, PII
- **Database:** All sensitive columns encrypted
- **Backups:** Encrypted before storage

### Encryption in Transit

- **Protocol:** TLS 1.3 minimum
- **Certificate:** Let's Encrypt with auto-renewal
- **HSTS:** Enabled, max-age=31536000
- **HPKP:** Optional (use with caution)
- **Cipher suites:** Modern ciphers only

### Data Retention

- **User data:** Retained as per user preference
- **Audit logs:** 90 days minimum, 2 years maximum
- **Backups:** 7 day retention, daily rotation
- **Deletion:** Cryptographic erasure (overwrite 3x)
- **GDPR:** Right to deletion implemented

---

## 3. API Security

### Rate Limiting

- **Global:** 1000 req/min across all users
- **Per-user:** 100 req/min per authenticated user
- **Per-IP:** 500 req/min per IP address
- **Auth attempts:** 5 per 15 minutes
- **Cleanup:** Automatic after window expires

### Input Validation

- **All inputs:** Validated using Zod schemas
- **SQL injection:** Parameterized queries only
- **XSS prevention:** HTML escaping on output
- **Path traversal:** Restrict to allowed directories
- **CSRF:** Token-based protection on state-changing operations

### Output Encoding

- **JSON:** Proper escaping for all strings
- **HTML:** HTML entity encoding
- **URL:** URL encoding for parameters
- **XML:** XML entity encoding
- **CSV:** Proper quoting to prevent injection

### API Key Management

- **Format:** UUID v4, minimum 32 characters
- **Storage:** Hashed using bcrypt (cost=12)
- **Rotation:** Every 90 days
- **Revocation:** Immediate on compromise
- **Audit:** All API key operations logged

---

## 4. Infrastructure Security

### Network Security

- **Firewall:** Whitelist approach
- **VPC:** Isolated network for production
- **Ingress:** TLS only, specific ports
- **Egress:** Whitelist external IPs
- **DDoS protection:** CloudFlare/AWS WAF

### Container Security

- **Base images:** Alpine/distroless only
- **Non-root user:** All containers run as non-root
- **Read-only root:** Enabled where possible
- **Secrets:** Never in images, use env vars
- **Scanning:** Trivy/Snyk scan all images

### Database Security

- **Access:** VPC-only, no direct internet access
- **Authentication:** Strong passwords (20+ chars)
- **Backup encryption:** All backups encrypted
- **Audit:** Log all admin access
- **Updates:** Monthly security patches

### Kubernetes Security

- **RBAC:** Least privilege roles
- **Network policies:** Restrict pod-to-pod traffic
- **Pod security:** Restricted PSP enabled
- **Secrets:** Encrypted etcd, not ConfigMaps
- **Audit logs:** All API access logged

---

## 5. Dependency Management

### Vulnerability Scanning

- **Frequency:** Daily automated scans
- **Tools:** npm audit, Snyk, Trivy
- **Severity levels:** Critical=immediate, High=1 week
- **Updates:** Automated for patch versions
- **Testing:** Full test suite after updates

### Approved Dependencies

- **Whitelist:** Maintained list of approved packages
- **License:** GPL prohibited, MIT/Apache preferred
- **Maintenance:** Active projects only
- **Popularity:** Minimum 1000 weekly downloads
- **Review:** 2 engineers sign-off on new deps

### Deprecated Dependencies

- **Removal:** Plan removal 6 months in advance
- **Migration:** Gradual migration strategy
- **Communication:** Notify users of changes
- **Support:** Maintain 2 versions during transition

---

## 6. Secrets Management

### Environment Variables

- **Never commit:** Use .env.example instead
- **Rotation:** Every 90 days
- **Scope:** Service-specific secrets
- **Audit:** All secret access logged
- **Backup:** Secrets stored separately

### API Keys

- **Unique per environment:** Prod, staging, dev
- **Prefix:** Include service name (e.g., openai_sk_...)
- **Expiration:** 1 year maximum
- **Monitoring:** Alert on unusual usage patterns
- **Revocation:** Immediate on suspected compromise

### Certificate Management

- **Auto-renewal:** 30 days before expiration
- **Monitoring:** Alert 15 days before expiration
- **Rotation:** Coordinated with deployment
- **Backup:** Store private keys securely
- **Audit:** Track certificate history

---

## 7. Incident Response

### Security Incidents

**Classification:**
- **Critical:** Confirmed data breach, active attack
- **High:** Potential breach, ongoing investigation
- **Medium:** Suspicious activity, requires review
- **Low:** Informational, no immediate action

**Response Steps:**
1. **Contain:** Isolate affected systems
2. **Investigate:** Gather forensic evidence
3. **Notify:** Internal + external stakeholders
4. **Remediate:** Fix root cause
5. **Verify:** Ensure no further compromises
6. **Restore:** Resume normal operations
7. **Report:** Post-incident analysis

### Vulnerability Disclosure

- **Process:** security@pr-agent.dev
- **Timeline:** 90-day disclosure deadline
- **Fix:** Critical fixes within 24 hours
- **Credit:** Public credit to researcher
- **Bounty:** Bug bounty program optional

---

## 8. Compliance

### Compliance Standards

- **GDPR:** Data protection, consent, deletion
- **HIPAA:** If handling health data (TBD)
- **PCI-DSS:** If handling payments (planned)
- **SOC 2:** Annual audit (planned Year 2)
- **ISO 27001:** Target certification

### Audit Logging

- **What:** All authentication, authorization, data access
- **How:** Structured JSON logs with correlation IDs
- **Retention:** 90 days operational, 2 years archived
- **Review:** Monthly audit log review
- **Alerts:** Automatic alerts on suspicious patterns

### Data Classification

- **Public:** Non-sensitive, can be disclosed
- **Internal:** Company use only
- **Confidential:** Requires explicit access
- **Restricted:** Minimal access, highly sensitive

### Regular Reviews

- **Security audit:** Quarterly internal review
- **Penetration testing:** Annual external assessment
- **Code review:** 2-engineer approval required
- **Dependency updates:** Monthly review
- **Access review:** Quarterly user access audit

---

## Security Checklist for Deployments

- [ ] All tests passing
- [ ] Security headers verified
- [ ] Dependencies scanned and updated
- [ ] Secrets not in code
- [ ] API keys rotated
- [ ] Database backup created
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Performance baseline established
- [ ] Security team notified

## Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

Instead, email security@pr-agent.dev with:
1. Description of vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix (if any)
5. Your contact information

We will acknowledge within 24 hours and provide updates every 7 days.
