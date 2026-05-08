#!/usr/bin/env bash
# Create deployment archives for manual upload

echo "📦 Creating deployment archives..."

# Create archives for both sites
cd "/Volumes/WORKSPACE/poseidon 2"

echo "🗜️  Compressing Mommy Care site..."
tar -czf mommy-care-deploy.tar.gz mommy-care/

echo "🗜️  Compressing El Kit de Cuidado site..."  
tar -czf el-kit-de-cuidado-deploy.tar.gz el-kit-de-cuidado/

echo "✅ Archives created:"
ls -lh *-deploy.tar.gz

echo ""
echo "📋 Next Steps:"
echo "1. Upload these .tar.gz files to the server using SFTP or your preferred method"
echo "2. Extract them on the server: tar -xzf mommy-care-deploy.tar.gz -C /opt/strykefox/"
echo "3. Extract them on the server: tar -xzf el-kit-de-cuidado-deploy.tar.gz -C /opt/strykefox/"
echo "4. Follow the deployment commands in MANUAL_DEPLOYMENT_GUIDE.md"
