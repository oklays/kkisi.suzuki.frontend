<?php
// Synthetic probe of legacy parsing behaviour. No DB, no network. Reads only rt/synthetic_import.xlsx.
require '/legacy/third_party/spout/src/Spout/Autoloader/autoload.php';
use Box\Spout\Reader\Common\Creator\ReaderEntityFactory;
function cetak_nodb($s){ return strip_tags(htmlentities($s, ENT_QUOTES, 'UTF-8')); } // cetak() minus DB escape_str
$r = ReaderEntityFactory::createXLSXReader(); $r->open('/rt/edge_cells.xlsx');
foreach ($r->getSheetIterator() as $sheet) { $n = 2; foreach ($sheet->getRowIterator() as $row) {
  $cells = $row->getCells(); $out = array();
  foreach ($cells as $i => $c) { $v = $c->getValue(); $out[] = $i.':'.(is_object($v) ? get_class($v) : gettype($v)).'='.(is_object($v) ? $v->format('Y-m-d') : var_export($v, true)); }
  echo "numRow=$n cells=".count($cells)." [".implode(' | ', $out)."]\n";
  if ($n > 2 && isset($cells[0])) {
    try { $d = date('Y-m-d', strtotime($cells[0])); echo "   legacy date(strtotime(cell0)) => $d\n"; }
    catch (Throwable $e) { echo "   legacy date(strtotime(cell0)) => ".get_class($e).": ".$e->getMessage()."\n"; }
  }
  $n++; } }
echo "row-index 4 on 2-col row isset? ".var_export(isset($cells[4]), true)."\n";
echo "strtotime('')            => ".var_export(strtotime(''), true)." -> ".date('Y-m-d', strtotime(''))."\n";
echo "strtotime('12/05/2022')  => ".date('Y-m-d', strtotime('12/05/2022'))." (US m/d)\n";
echo "strtotime('44900')       => ".var_export(strtotime('44900'), true)."\n";
echo "cetak(\"O'NEIL & SONS\")  => ".cetak_nodb("O'NEIL & SONS")."\n";
echo "limit rule ('0' > '0' || '0' != '')   => ".var_export(('0' > '0' || '0' != ''), true)."\n";
echo "gaji minus ('1.500.000' > '200000')   => ".var_export(('1.500.000' > '200000'), true)."\n";
echo "gaji minus ('250000' > '200000')      => ".var_export(('250000' > '200000'), true)."\n";
echo "CONVERT-like match ('09901'==(string)(int)'09901') => ".var_export('09901' === (string)(int)'09901', true)."\n";
