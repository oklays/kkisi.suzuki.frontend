<?php
$dbHost = getenv('DB_READ_HOST') ? getenv('DB_READ_HOST') : '127.0.0.1';
$dbPort = getenv('DB_READ_PORT') ? getenv('DB_READ_PORT') : '3306';
$dbName = getenv('DB_READ_NAME') ? getenv('DB_READ_NAME') : 'n1608204_smart_kopkar';
$dbUser = getenv('DB_READ_USER') ? getenv('DB_READ_USER') : 'read_only_user';
$dbPass = getenv('DB_READ_PASSWORD') ? getenv('DB_READ_PASSWORD') : '';

$pdo = new PDO(
    "mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4",
    $dbUser,
    $dbPass,
    array(
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    )
);

// 1. Companies
$companies = $pdo->query("SELECT id, company_name FROM db_company WHERE id IN (1, 2, 3) ORDER BY id")->fetchAll();
$compMap = array();
foreach ($companies as $c) {
    $compMap[(int)$c['id']] = $c['company_name'];
}
$shortMap = array(
    1 => 'TB II (Tambun)',
    2 => 'TB II (Kp. Bulu)',
    3 => 'GIIC (Cikarang)',
);

// 2. All October 2026 sales across stores 1, 2, 3
$sqlSales = "
SELECT
  s.id,
  s.company_id,
  s.sales_code,
  DATE_FORMAT(s.sales_date, '%Y-%m-%d') AS sales_date,
  s.customer_name,
  s.nik_kar,
  s.created_by,
  s.pos,
  s.sales_status,
  s.payment_status,
  s.payment_type,
  s.status AS record_status,
  s.return_bit,
  CAST(s.grand_total AS DECIMAL(18,2)) AS grand_total,
  CAST(s.paid_amount AS DECIMAL(18,2)) AS paid_amount,
  CAST(s.subtotal AS DECIMAL(18,2)) AS subtotal,
  CAST(s.tot_discount_to_all_amt AS DECIMAL(18,2)) AS discount,
  s.id_buka_kasir AS register_id,
  r.noref AS register_reference,
  k.no_kasir AS cashier_label
FROM db_sales s
LEFT JOIN db_buka_kasir r ON r.id = s.id_buka_kasir AND r.company_id = s.company_id
LEFT JOIN db_kasir k ON k.id = s.id_kasir AND k.company_id = s.company_id
WHERE s.company_id IN (1, 2, 3)
  AND s.ppob = 0
  AND s.sales_date >= '2026-10-01'
  AND s.sales_date < '2026-11-01'
ORDER BY s.sales_date ASC, s.id ASC
";
$rawSales = $pdo->query($sqlSales)->fetchAll();

$sales = array();
foreach ($rawSales as $row) {
    $cid = (int)$row['company_id'];
    $cust = isset($row['customer_name']) ? trim($row['customer_name']) : '';
    $nik = isset($row['nik_kar']) ? trim($row['nik_kar']) : '';
    $validNik = ($nik !== '' && $nik !== '0') ? $nik : null;
    $gtSen = $row['grand_total'] !== null ? (int)round(((float)$row['grand_total']) * 100) : null;
    $paidSen = $row['paid_amount'] !== null ? (int)round(((float)$row['paid_amount']) * 100) : null;
    $subSen = $row['subtotal'] !== null ? (int)round(((float)$row['subtotal']) * 100) : null;
    $discSen = $row['discount'] !== null ? (int)round(((float)$row['discount']) * 100) : null;

    $sales[] = array(
        'saleId' => (int)$row['id'],
        'companyId' => $cid,
        'companyName' => isset($compMap[$cid]) ? $compMap[$cid] : "Company $cid",
        'companyShortName' => isset($shortMap[$cid]) ? $shortMap[$cid] : "Store $cid",
        'salesCode' => $row['sales_code'],
        'saleDate' => $row['sales_date'],
        'customerName' => $cust !== '' ? $cust : 'Nama pelanggan tidak tersimpan',
        'memberNik' => $validNik,
        'createdBy' => $row['created_by'],
        'source' => ((int)$row['pos'] === 1) ? 'pos' : 'nonpos',
        'salesStatus' => $row['sales_status'],
        'paymentStatus' => $row['payment_status'],
        'paymentType' => $row['payment_type'],
        'recordStatus' => (int)$row['record_status'],
        'returnBit' => $row['return_bit'],
        'grandTotalSen' => $gtSen,
        'paidSen' => $paidSen,
        'subtotalSen' => $subSen,
        'discountSen' => $discSen,
        'registerId' => $row['register_id'] !== null ? (int)$row['register_id'] : null,
        'registerReference' => $row['register_reference'],
        'cashierLabel' => $row['cashier_label'],
    );
}

// 3. Member NIK resolution from m_anggota
$nikToName = array();
$nikRows = $pdo->query("SELECT nik_kar, nama_kar FROM m_anggota WHERE nik_kar IS NOT NULL AND nik_kar <> ''")->fetchAll();
foreach ($nikRows as $nr) {
    $nk = trim($nr['nik_kar']);
    $nm = isset($nr['nama_kar']) ? trim($nr['nama_kar']) : '';
    if ($nk !== '' && $nm !== '') {
        $nikToName[$nk] = $nm;
        $trimmedZero = ltrim($nk, '0');
        if ($trimmedZero !== '' && !isset($nikToName[$trimmedZero])) {
            $nikToName[$trimmedZero] = $nm;
        }
        $padded6 = str_pad($trimmedZero, 6, '0', STR_PAD_LEFT);
        if (!isset($nikToName[$padded6])) {
            $nikToName[$padded6] = $nm;
        }
    }
}

foreach ($sales as $s) {
    if ($s['memberNik'] && $s['customerName'] !== 'Nama pelanggan tidak tersimpan' && !isset($nikToName[$s['memberNik']])) {
        $nikToName[$s['memberNik']] = $s['customerName'];
    }
}

// 4. Returns in October 2026 across stores 1, 2, 3
$returns = $pdo->query("
SELECT id, company_id, return_code, DATE_FORMAT(return_date, '%Y-%m-%d') AS return_date,
       return_status, CAST(grand_total AS DECIMAL(18,2)) AS grand_total, created_by
FROM db_salesreturn
WHERE company_id IN (1, 2, 3)
  AND return_date >= '2026-10-01'
  AND return_date < '2026-11-01'
")->fetchAll();

// 5. Items & Category Summary (Consolidated & Per Store)
function queryItemsSummary($pdo, $companyFilterSql) {
    $totals = $pdo->query("
        SELECT
          COUNT(DISTINCT s.id) AS tx_count,
          COUNT(si.id) AS line_count,
          COALESCE(SUM(si.sales_qty), 0) AS total_qty,
          COALESCE(SUM(si.total_cost), 0) AS total_line_sales,
          COALESCE(SUM(si.sales_qty * COALESCE(si.purchase_price, i.purchase_price, 0)), 0) AS est_cogs
        FROM db_sales s
        JOIN db_salesitems si ON si.sales_id = s.id AND si.company_id = s.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = s.company_id
        WHERE $companyFilterSql
          AND s.ppob = 0
          AND s.sales_date >= '2026-10-01' AND s.sales_date < '2026-11-01'
          AND s.sales_status = 'Final' AND s.status = 1
          AND si.status = 1
    ")->fetch();

    $byCategory = $pdo->query("
        SELECT
          COALESCE(NULLIF(TRIM(c.category_name), ''), 'Tanpa Kategori') AS categoryName,
          COUNT(DISTINCT si.item_id) AS uniqueItems,
          COUNT(DISTINCT s.id) AS txCount,
          COALESCE(SUM(si.sales_qty), 0) AS totalQty,
          COALESCE(SUM(si.total_cost), 0) AS totalRevenue,
          COALESCE(SUM(si.sales_qty * COALESCE(si.purchase_price, i.purchase_price, 0)), 0) AS estCogs
        FROM db_sales s
        JOIN db_salesitems si ON si.sales_id = s.id AND si.company_id = s.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = s.company_id
        LEFT JOIN db_category c ON c.id = i.category_id
        WHERE $companyFilterSql
          AND s.ppob = 0
          AND s.sales_date >= '2026-10-01' AND s.sales_date < '2026-11-01'
          AND s.sales_status = 'Final' AND s.status = 1
          AND si.status = 1
        GROUP BY categoryName
        ORDER BY totalRevenue DESC
    ")->fetchAll();

    $topItems = $pdo->query("
        SELECT
          MAX(si.item_id) AS itemId,
          MAX(s.company_id) AS sampleCompanyId,
          COALESCE(MAX(NULLIF(TRIM(i.item_code), '')), '-') AS itemCode,
          COALESCE(MAX(NULLIF(TRIM(i.item_name), '')), MAX(NULLIF(TRIM(si.description), '')), CONCAT('Item #', MAX(si.item_id))) AS itemName,
          COALESCE(MAX(NULLIF(TRIM(c.category_name), '')), 'Tanpa Kategori') AS categoryName,
          COUNT(DISTINCT s.id) AS txCount,
          COALESCE(SUM(si.sales_qty), 0) AS totalQty,
          COALESCE(MAX(si.price_per_unit), 0) AS unitPrice,
          COALESCE(SUM(si.total_cost), 0) AS totalRevenue,
          COALESCE(SUM(si.sales_qty * COALESCE(si.purchase_price, i.purchase_price, 0)), 0) AS estCogs
        FROM db_sales s
        JOIN db_salesitems si ON si.sales_id = s.id AND si.company_id = s.company_id
        LEFT JOIN db_items i ON i.id = si.item_id AND i.company_id = s.company_id
        LEFT JOIN db_category c ON c.id = i.category_id
        WHERE $companyFilterSql
          AND s.ppob = 0
          AND s.sales_date >= '2026-10-01' AND s.sales_date < '2026-11-01'
          AND s.sales_status = 'Final' AND s.status = 1
          AND si.status = 1
        GROUP BY COALESCE(NULLIF(TRIM(i.item_name), ''), NULLIF(TRIM(si.description), ''), CONCAT('Item #', si.item_id)), COALESCE(NULLIF(TRIM(c.category_name), ''), 'Tanpa Kategori')
        ORDER BY totalRevenue DESC
        LIMIT 100
    ")->fetchAll();

    return array(
        'totals' => $totals,
        'byCategory' => $byCategory,
        'topItemsByRevenue' => $topItems,
    );
}

$itemsAll = queryItemsSummary($pdo, "s.company_id IN (1, 2, 3)");
$itemsByStore = array(
    1 => queryItemsSummary($pdo, "s.company_id = 1"),
    2 => queryItemsSummary($pdo, "s.company_id = 2"),
    3 => queryItemsSummary($pdo, "s.company_id = 3"),
);

echo json_encode(array(
    'companies' => $companies,
    'sales' => $sales,
    'returns' => $returns,
    'nikToName' => $nikToName,
    'itemsAll' => $itemsAll,
    'itemsByStore' => $itemsByStore,
), JSON_UNESCAPED_UNICODE);
