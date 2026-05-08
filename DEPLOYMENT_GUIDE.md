# StrykeFox Maternity Sites Deployment Guide

## Overview
Bilingual maternity care sites deployed to StrykeFox Platform:
- **English**: strykefox.com/mommy-care
- **Spanish**: strykefox.com/el-kit-de-cuidado

## Architecture
- Both sites are Next.js applications with App Router
- API endpoints configured for Poseidon Production API (api.strykefox.com)
- Separate ports: Mommy Care (3001), El Kit de Cuidado (3002)
- Nginx reverse proxy for subdirectory routing

## Deployment Commands

### Deploy English Site (Mommy Care)
```bash
cd /Volumes/WORKSPACE/poseidon\ 2/mommy-care
chmod +x scripts/deploy-mommy-care.sh
./scripts/deploy-mommy-care.sh
```

### Deploy Spanish Site (El Kit de Cuidado)
```bash
cd /Volumes/WORKSPACE/poseidon\ 2/el-kit-de-cuidado
chmod +x scripts/deploy-mommy-care.sh
./scripts/deploy-mommy-care.sh
```

## Production Server Details
- **IP**: 157.230.145.247
- **Path**: /opt/strykefox/
- **English**: /opt/strykefox/mommy-care/
- **Spanish**: /opt/strykefox/el-kit-de-cuidado/

## Nginx Configuration
Each site creates its own Nginx configuration:
- `/etc/nginx/sites-available/mommy-care`
- `/etc/nginx/sites-available/el-kit-de-cuidado`

## API Configuration
Both sites are configured to use:
- **POSEIDON_API_URL**: https://api.strykefox.com
- **Environment Variable**: POSEIDON_API_KEY (required)

## Key Features
✅ FDA-approved medical products
✅ Insurance coverage verification
✅ 5-step intake form
✅ Bilingual support (English/Spanish)
✅ Mobile-responsive design
✅ StrykeFox brand theme matching

## DNS Configuration
- **Domain**: elkitdecuidado.com → CNAME to strykefox.com/el-kit-de-cuidado
- **English**: strykefox.com/mommy-care
- **Spanish**: strykefox.com/el-kit-de-cuidado

## Testing Checklist
- [ ] Build both sites locally (`npm run build`)
- [ ] Test API endpoints functionality
- [ ] Verify intake form submissions
- [ ] Check Nginx reverse proxy
- [ ] Test mobile responsiveness
- [ ] Validate insurance eligibility flow

## Troubleshooting
1. **Build Issues**: Clear node_modules and reinstall
2. **Port Conflicts**: Kill existing processes on ports 3001/3002
3. **Nginx Errors**: Check configuration syntax with `nginx -t`
4. **API Failures**: Verify POSEIDON_API_KEY environment variable

## Revenue Flow
1. User visits site → Insurance verification → Intake form → Patient creation in Poseidon → Order processing → Product shipment

## Support
- **API Issues**: Check Poseidon platform logs
- **Deployment**: Review deployment script output
- **Performance**: Monitor Next.js server logs
