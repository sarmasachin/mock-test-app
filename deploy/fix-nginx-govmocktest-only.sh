#!/bin/bash
# Run on VPS as root — removes livehospital / indiaapk nginx configs that steal govmocktest traffic.
set -e

echo "=== Disable ALL nginx sites ==="
rm -f /etc/nginx/sites-enabled/*

echo "=== Remove old domain configs ==="
rm -f /etc/nginx/sites-available/livehospital*
rm -f /etc/nginx/sites-available/*livehospital*
rm -f /etc/nginx/sites-available/indiaapk*
rm -f /etc/nginx/sites-available/admin-admin.livehospital*

echo "=== Install govmocktest-only nginx site ==="
cp /var/www/mocktestapp/deploy/nginx-site.govmocktest.conf.example \
   /etc/nginx/sites-available/admin-admin.govmocktest.com
ln -sf /etc/nginx/sites-available/admin-admin.govmocktest.com /etc/nginx/sites-enabled/

echo "=== Ensure admin static path exists ==="
mkdir -p /var/www/admin-admin.govmocktest.com/site/admin
chown -R www-data:www-data /var/www/admin-admin.govmocktest.com

echo "=== Remaining livehospital/indiaapk references (should be empty) ==="
grep -r "livehospital\|indiaapk" /etc/nginx/ 2>/dev/null || echo "(none — good)"

nginx -t
systemctl reload nginx

echo "=== DONE ==="
echo "Only admin-admin.govmocktest.com should be enabled."
echo "Run: certbot --nginx -d admin-admin.govmocktest.com  (if SSL not yet issued)"
