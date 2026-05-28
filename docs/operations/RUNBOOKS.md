# Operational Runbooks

Production operational procedures for PR-Agent.

## Table of Contents
1. Deployment Procedures
2. Incident Response
3. Database Operations
4. Scaling & Performance
5. Monitoring & Alerts
6. Recovery Procedures

---

## 1. Deployment Procedures

### Standard Deployment

**Prerequisites:**
- All tests passing locally (`npm test`)
- Code reviewed and merged to main
- Deployment approved by lead engineer

**Steps:**
1. Check deployment status: `kubectl rollout status deployment/pr-agent-app -n pr-agent`
2. Create backup: `kubectl exec -it postgres-pod -- pg_dump -U pruser pragent > backup-$(date +%Y%m%d-%H%M%S).sql`
3. Deploy: `kubectl apply -f k8s/`
4. Monitor rollout: `kubectl rollout status deployment/pr-agent-app -n pr-agent --timeout=5m`
5. Run smoke tests: `npm run test:smoke`
6. Verify metrics: Check `/api/metrics` for normal behavior

**Rollback (if needed):**
```bash
kubectl rollout undo deployment/pr-agent-app -n pr-agent
kubectl rollout status deployment/pr-agent-app -n pr-agent
```

### Blue-Green Deployment

For zero-downtime deployments:

1. Deploy to green environment
2. Run full test suite on green
3. Switch traffic using ingress rules
4. Monitor for 30 minutes
5. Keep blue as fallback for 1 hour

### Database Migration

1. Create backup first
2. Test migration on staging
3. Schedule maintenance window (off-peak)
4. Run migration: `npm run migrate:up`
5. Verify schema: `npm run verify:schema`
6. Monitor performance for 1 hour

---

## 2. Incident Response

### P1 Incident (Complete Outage)

**Detection:** Alert: "Health check failure" or "Error rate > 5%"

**Response (0-5 min):**
1. Page on-call engineer immediately
2. Acknowledge incident in Slack
3. Check `/api/health` endpoint
4. Review error logs: `kubectl logs -n pr-agent deployment/pr-agent-app -f`

**Investigation (5-15 min):**
1. Check metrics: `curl https://api.pr-agent.dev/api/metrics`
2. Review recent deployments: `git log --oneline -10`
3. Check database connectivity
4. Review recent config changes

**Mitigation (15-30 min):**
- Option A: Rollback last deployment
- Option B: Scale down to identify resource issue
- Option C: Restart pods: `kubectl rollout restart deployment/pr-agent-app -n pr-agent`

### P2 Incident (Degraded Performance)

**Detection:** Alert: "Response time > 500ms" or "Error rate > 1%"

**Response:**
1. Check metrics endpoint
2. Identify affected endpoints
3. Check error logs for patterns
4. Review database query performance
5. Scale up if CPU > 70%: `kubectl scale deployment pr-agent-app --replicas=5 -n pr-agent`

### P3 Incident (Minor Issues)

**Detection:** Single endpoint failure, rate limit hits, etc.

**Response:**
1. Investigate in background
2. Implement fix
3. Deploy in regular cycle
4. Document in incident log

---

## 3. Database Operations

### Database Backup

**Automatic (Daily):**
```bash
0 2 * * * pg_dump -U pruser pragent > /backups/pragent-$(date +\%Y\%m\%d).sql
```

**Manual Backup:**
```bash
kubectl exec -it postgres-pod -- pg_dump -U pruser pragent > backup.sql
```

**Restore from Backup:**
```bash
psql -U pruser pragent < backup.sql
```

### Database Cleanup

**Remove old audit logs (monthly):**
```sql
DELETE FROM audit_logs WHERE timestamp < NOW() - INTERVAL '90 days';
VACUUM ANALYZE;
```

**Clear old sessions:**
```sql
DELETE FROM sessions WHERE expires_at < NOW();
```

### Performance Tuning

**Analyze slow queries:**
```sql
SELECT query, mean_exec_time, max_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC LIMIT 10;
```

**Add missing indexes:**
```sql
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
ANALYZE;
```

---

## 4. Scaling & Performance

### Horizontal Scaling

**Check current load:**
```bash
kubectl top nodes
kubectl top pods -n pr-agent
```

**Scale up:**
```bash
kubectl scale deployment pr-agent-app --replicas=5 -n pr-agent
```

**Monitor auto-scaling:**
```bash
kubectl get hpa -n pr-agent
```

### Caching Strategy

**Redis monitoring:**
```bash
redis-cli INFO stats
redis-cli --bigkeys  # Find large keys
```

**Clear cache (if needed):**
```bash
redis-cli FLUSHDB
```

---

## 5. Monitoring & Alerts

### Key Metrics to Monitor

- **API Response Time:** Target < 150ms (p95)
- **Error Rate:** Target < 0.1%
- **Uptime:** Target > 99.9%
- **Database Connections:** Keep < 80% of max
- **Memory Usage:** Alert if > 85%
- **Disk Usage:** Alert if > 80%

### Checking Logs

**Real-time logs:**
```bash
kubectl logs -n pr-agent deployment/pr-agent-app -f
```

**Error logs only:**
```bash
kubectl logs -n pr-agent deployment/pr-agent-app --since=1h | grep ERROR
```

**Search logs:**
```bash
kubectl logs -n pr-agent deployment/pr-agent-app --since=24h | grep "request_id"
```

---

## 6. Recovery Procedures

### Service Recovery

1. **Identify the issue** using logs and metrics
2. **Determine scope** (single endpoint vs full outage)
3. **Apply fix** (hotfix, rollback, or scaled restart)
4. **Verify recovery** using health checks and smoke tests
5. **Document** in incident log

### Data Recovery

**From recent backup:**
```bash
# Create new DB from backup
psql -U pruser pragent_restore < backup.sql

# Verify data
psql -U pruser pragent_restore -c "SELECT COUNT(*) FROM users;"

# Switch over when verified
mv pragent pragent_corrupted
mv pragent_restore pragent
```

### Circuit Breaker Reset

If external service recovered:
```bash
curl -X POST http://localhost:3000/api/admin/circuit-breaker/reset \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"service": "github-api"}'
```

---

## Escalation Path

- **P1 (Outage):** Immediate page on-call → Team lead → CTO
- **P2 (Degradation):** On-call → Team lead (within 15 min)
- **P3 (Minor):** On-call handles in background

## Post-Incident

1. Create incident report within 24 hours
2. Root cause analysis
3. Implement preventive measures
4. Update runbooks if needed
5. Share learnings in team meeting
