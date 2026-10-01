#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# setup-staging.sh — KKISI Staging Database Setup
#
# Creates a MariaDB 11.4 container with a FULL copy of the production database
# (n1608204_smart_kopkar → kkisi_staging) plus performance indexes.
#
# Prerequisites:
#   - Docker running
#   - .env.staging with MARIADB_ROOT_PASSWORD and MARIADB_READ_PASSWORD
#   - staging/kkisi_full_dump.sql.gz (production dump, ~88 MB compressed)
#
# Usage:
#   ./scripts/setup-staging.sh          # first-time setup
#   ./scripts/setup-staging.sh --reset  # destroy and recreate from scratch
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

# ── Load env ──────────────────────────────────────────────────────────────────
if [ ! -f .env.staging ]; then
  echo "❌ .env.staging not found. Copy .env.staging.example and fill in passwords."
  exit 1
fi
set -a; source .env.staging; set +a

CONTAINER=kkisi-staging
VOLUME=kkisi-staging-data
DUMP_FILE=staging/kkisi_full_dump.sql.gz
DB_NAME=kkisi_staging

# ── Handle --reset flag ──────────────────────────────────────────────────────
if [[ "${1:-}" == "--reset" ]]; then
  echo "🗑️  Removing existing container and volume..."
  docker stop "$CONTAINER" 2>/dev/null || true
  docker rm "$CONTAINER" 2>/dev/null || true
  docker volume rm "$VOLUME" 2>/dev/null || true
fi

# ── Check if container already exists ─────────────────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "⚠️  Container '$CONTAINER' already exists."
  if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "✅ Already running. Testing connection..."
  else
    echo "🔄 Starting stopped container..."
    docker start "$CONTAINER"
    sleep 3
  fi
  docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" -e "SELECT 1" >/dev/null 2>&1 \
    && echo "✅ Database connection OK" || echo "❌ Cannot connect"
  echo ""
  echo "Table count: $(docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" "$DB_NAME" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_TYPE='BASE TABLE';" 2>/dev/null)"
  exit 0
fi

# ── Check dump file ──────────────────────────────────────────────────────────
if [ ! -f "$DUMP_FILE" ]; then
  echo "❌ Dump file not found: $DUMP_FILE"
  echo ""
  echo "To create the dump from production:"
  echo "  ssh -p 65002 n1608204@srv149.niagahoster.com \\"
  echo "    'mysqldump --single-transaction --routines --triggers --events --add-drop-table \\"
  echo "     -u n1608204_kkisi -p\"PASSWORD\" n1608204_smart_kopkar | gzip > /tmp/kkisi_full_dump.sql.gz'"
  echo ""
  echo "Then download:"
  echo "  scp -P 65002 n1608204@srv149.niagahoster.com:/tmp/kkisi_full_dump.sql.gz staging/"
  exit 1
fi

echo "🐳 Creating MariaDB 11.4 container..."
docker run -d --name "$CONTAINER" \
  -e MARIADB_ROOT_PASSWORD="$MARIADB_ROOT_PASSWORD" \
  -e MARIADB_DATABASE="$DB_NAME" \
  --publish 127.0.0.1:3307:3306 \
  --volume "$VOLUME":/var/lib/mysql \
  --tmpfs /tmp:rw,exec,size=512m \
  mariadb:11.4 \
  --innodb-buffer-pool-size=512M \
  --max-allowed-packet=256M \
  --character-set-server=utf8 \
  --collation-server=utf8_general_ci

# ── Wait for readiness ───────────────────────────────────────────────────────
echo "⏳ Waiting for MariaDB to be ready..."
for i in $(seq 1 90); do
  if docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" -N -e 'SELECT 1' >/dev/null 2>&1; then
    echo "✅ Ready after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    echo "❌ MariaDB failed to start in 90s"
    docker logs "$CONTAINER" | tail -20
    exit 1
  fi
done

# ── Restore dump ─────────────────────────────────────────────────────────────
echo "📥 Restoring production dump (this takes ~1 minute for ~800 MB)..."
SECONDS=0
gunzip -c "$DUMP_FILE" | docker exec -i "$CONTAINER" \
  mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" "$DB_NAME"
echo "✅ Restored in ${SECONDS}s"

# ── Add performance indexes ──────────────────────────────────────────────────
echo "🔧 Adding performance indexes..."
docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" "$DB_NAME" <<'SQL'
-- db_items: POS barcode/name search (replaces full table scan)
ALTER TABLE db_items
  ADD INDEX IF NOT EXISTS idx_items_company_status (company_id, status),
  ADD INDEX IF NOT EXISTS idx_items_barcode (custom_barcode),
  ADD INDEX IF NOT EXISTS idx_items_barcode_pack (custom_barcode_pack),
  ADD INDEX IF NOT EXISTS idx_items_name (item_name),
  ADD INDEX IF NOT EXISTS idx_items_category (category_id);

-- db_sales: filtered by company+date, company+status
ALTER TABLE db_sales
  ADD INDEX IF NOT EXISTS idx_sales_company_date (company_id, sales_date),
  ADD INDEX IF NOT EXISTS idx_sales_company_status (company_id, sales_status),
  ADD INDEX IF NOT EXISTS idx_sales_code (sales_code),
  ADD INDEX IF NOT EXISTS idx_sales_nik (nik_kar),
  ADD INDEX IF NOT EXISTS idx_sales_customer (customer_id),
  ADD INDEX IF NOT EXISTS idx_sales_buka_kasir (id_buka_kasir);

-- db_salesitems: joined on sales_id
ALTER TABLE db_salesitems
  ADD INDEX IF NOT EXISTS idx_salesitems_sales (sales_id),
  ADD INDEX IF NOT EXISTS idx_salesitems_item (item_id),
  ADD INDEX IF NOT EXISTS idx_salesitems_sales_code (sales_code);

-- db_salespayments: joined on sales_id
ALTER TABLE db_salespayments
  ADD INDEX IF NOT EXISTS idx_salespayments_sales (sales_id),
  ADD INDEX IF NOT EXISTS idx_salespayments_customer (customer_id);

-- db_cart: filtered by sales_code
ALTER TABLE db_cart
  ADD INDEX IF NOT EXISTS idx_cart_sales_code (sales_code);

-- m_anggota: member lookup by NIK
ALTER TABLE m_anggota
  ADD INDEX IF NOT EXISTS idx_anggota_nik (nik_kar),
  ADD INDEX IF NOT EXISTS idx_anggota_idcard (id_card),
  ADD INDEX IF NOT EXISTS idx_anggota_status (status_anggota(20));

-- db_buka_kasir: kasir session lookup
ALTER TABLE db_buka_kasir
  ADD INDEX IF NOT EXISTS idx_bukakasir_user_company (user_id, company_id, status);

-- db_purchase + items
ALTER TABLE db_purchase
  ADD INDEX IF NOT EXISTS idx_purchase_company_date (company_id, purchase_date),
  ADD INDEX IF NOT EXISTS idx_purchase_supplier (supplier_id);

ALTER TABLE db_purchaseitems
  ADD INDEX IF NOT EXISTS idx_purchaseitems_purchase (purchase_id),
  ADD INDEX IF NOT EXISTS idx_purchaseitems_item (item_id);

-- db_stockentry: stock calculations
ALTER TABLE db_stockentry
  ADD INDEX IF NOT EXISTS idx_stockentry_item_company (item_id, company_id);

-- db_inventory_so_dtl: stock opname
ALTER TABLE db_inventory_so_dtl
  ADD INDEX IF NOT EXISTS idx_so_dtl_so (so_id),
  ADD INDEX IF NOT EXISTS idx_so_dtl_item (item_id);
SQL
echo "✅ Indexes added"

# ── Create application users ─────────────────────────────────────────────────
echo "👤 Creating application users..."
docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" <<SQL
  -- Read-only user (for Prisma read path)
  DROP USER IF EXISTS 'kkisi_read'@'%';
  CREATE USER 'kkisi_read'@'%' IDENTIFIED BY '$MARIADB_READ_PASSWORD';
  GRANT SELECT ON $DB_NAME.* TO 'kkisi_read'@'%';

  -- App user (for write operations: cart, sales, etc.)
  DROP USER IF EXISTS 'kkisi_app'@'%';
  CREATE USER 'kkisi_app'@'%' IDENTIFIED BY '${MARIADB_APP_PASSWORD:-$MARIADB_READ_PASSWORD}';
  GRANT SELECT, INSERT, UPDATE, DELETE ON $DB_NAME.* TO 'kkisi_app'@'%';

  FLUSH PRIVILEGES;
SQL
echo "✅ Users created"

# ── Validation ────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════"
echo "  STAGING DATABASE READY"
echo "════════════════════════════════════════════════════════════"
echo ""
TABLE_COUNT=$(docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" "$DB_NAME" -N -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_TYPE='BASE TABLE';" 2>/dev/null)
VIEW_COUNT=$(docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" "$DB_NAME" -N -e \
  "SELECT COUNT(*) FROM information_schema.VIEWS WHERE TABLE_SCHEMA='$DB_NAME';" 2>/dev/null)
DB_SIZE=$(docker exec "$CONTAINER" mariadb -uroot "-p$MARIADB_ROOT_PASSWORD" -N -e \
  "SELECT ROUND(SUM(data_length+index_length)/1024/1024,2) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DB_NAME';" 2>/dev/null)

echo "  Tables: $TABLE_COUNT"
echo "  Views:  $VIEW_COUNT"
echo "  Size:   ${DB_SIZE} MB"
echo "  Port:   127.0.0.1:3307"
echo ""
echo "  Connection URLs:"
echo "    Read:  mysql://kkisi_read:***@127.0.0.1:3307/$DB_NAME"
echo "    Write: mysql://kkisi_app:***@127.0.0.1:3307/$DB_NAME"
echo ""
echo "  Next: npx prisma generate && npm run dev"
echo "════════════════════════════════════════════════════════════"
