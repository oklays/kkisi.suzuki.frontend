<?php
// Reproduces the legacy loop shape (pinjaman_reguler_m.php:667-812) with a counter instead of INSERT. Synthetic file, no DB.
require '/legacy/third_party/spout/src/Spout/Autoloader/autoload.php';
use Box\Spout\Reader\Common\Creator\ReaderEntityFactory;
$reader = ReaderEntityFactory::createXLSXReader(); $reader->open('/rt/edge_three_sheets.xlsx');
$arr = array(); $inserts = array();
foreach ($reader->getSheetIterator() as $sheet) {
  $numRow = 2;
  foreach ($sheet->getRowIterator() as $row) { if ($numRow > 2) { $c = $row->getCells(); $arr[] = (string)$c[2]; } $numRow++; }
  foreach ($arr as $rows) { $inserts[] = $sheet->getName().":".$rows; }   // legacy: one trans_pinjaman INSERT per $rows
}
$reader->close();
echo "data rows in file: 2; simulated INSERTs: ".count($inserts)." => ".implode(', ', $inserts)."\n";
