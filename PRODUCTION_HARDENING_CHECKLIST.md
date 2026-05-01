# PRODUCTION HARDENING CHECKLIST

## ENVIRONMENT VALIDATION
- [ ] `INTERNAL_API_KEY` set and strong (min 32 chars)
- [ ] `POSEIDON_DATABASE_URL` configured with SSL if required
- [ ] `NEXTAUTH_SECRET` set and strong (min 32 chars)
- [ ] `POSEIDON_REDIS_PASSWORD` set and strong
- [ ] `POSEIDON_MINIO_ACCESS_KEY` and `SECRET_KEY` set
- [ ] All external API keys configured (Stedi, OpenAI, etc.)

## SECURITY HEADERS
- [ ] nginx proxy configured with security headers
- [ ] CORS policies properly configured
- [ ] Rate limiting on public endpoints
- [ ] API key validation enforced

## HEALTH CHECKS
- [ ] All services have `/ready` or `/health` endpoints
- [ ] Dependency health checks (DB, Redis, MinIO)
- [ ] Graceful degradation when dependencies fail
- [ ] Proper HTTP status codes for failures

## LOGGING & MONITORING
- [ ] Structured logging implemented
- [ ] Request IDs for correlation
- [ ] Error tracking configured
- [ ] Performance metrics collection
- [ ] Log rotation configured

## FILE HANDLING
- [ ] Upload size limits enforced
- [ ] MIME type validation
- [ ] Virus scanning (if applicable)
- [ ] Temporary file cleanup
- [ ] Secure file storage paths

## DATABASE SECURITY
- [ ] Connection pooling configured
- [ ] Query timeouts set
- [ ] Read-only users for reporting
- [ ] Database backups automated
- [ ] Access logging enabled

## BACKUP & RECOVERY
- [ ] Database backup schedule
- [ ] Document storage backup
- [ ] Disaster recovery procedures
- [ ] Restore testing completed
- [ ] RTO/RPO documented

## PERFORMANCE
- [ ] Caching strategies implemented
- [ ] CDN for static assets
- [ ] Database query optimization
- [ ] Memory usage monitoring
- [ ] Load balancing configured

## COMPLIANCE
- [ ] HIPAA compliance measures
- [ ] Data encryption at rest
- [ ] Data encryption in transit
- [ ] Audit logging enabled
- [ ] Access control implemented

## DEPLOYMENT AUTOMATION
- [ ] CI/CD pipeline configured
- [ ] Rolling deployments enabled
- [ ] Health checks in deployment pipeline
- [ ] Automated testing before deploy
- [ ] Rollback procedures documented
