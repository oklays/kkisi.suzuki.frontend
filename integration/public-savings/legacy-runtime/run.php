<?php
// Actual private source is required unchanged, except explicitly requested candidate entry hooks.
define('BASEPATH', '/source/ci2/system/');
define('APPPATH', '/harness/boundary/');
require APPPATH.'third_party/MX/Controller.php';
error_reporting(E_ALL & ~E_NOTICE & ~E_STRICT & ~E_DEPRECATED);
date_default_timezone_set('Asia/Jakarta');
class RuntimeInput {
    public $values;
    function __construct($values) {$this->values=$values;}
    function post($key) {return isset($this->values[$key])?$this->values[$key]:'';}
    function get($key) {return $this->post($key);}
}
class RuntimeSession {function userdata($key) {return 'synthetic-checker';}}
class RuntimeResult {
    private $rows;
    function __construct($rows) {$this->rows=$rows;}
    function row() {return count($this->rows)?(object)$this->rows[0]:null;}
    function row_array() {return count($this->rows)?$this->rows[0]:array();}
    function result() {return array_map(function($r){return (object)$r;},$this->rows);}
    function num_rows() {return count($this->rows);}
}
class RuntimeDb {
    public $pdo;public $writes=0;public $statements=array();private $select='*';private $from;private $where=array();private $params=array();private $order='';private $limit='';
    function __construct($config) {$this->pdo=new PDO('mysql:host='.$config['host'].';dbname='.$config['database'].';charset=utf8', $config['user'],$config['password'],array(PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION));$this->pdo->exec("SET SESSION sql_mode='NO_AUTO_CREATE_USER,NO_ENGINE_SUBSTITUTION'");}
    function query($sql,$params=array()) {$this->statements[]=preg_replace('/\s+/', ' ', $sql);$s=$this->pdo->prepare($sql);$s->execute($params);$rows=$s->columnCount()?$s->fetchAll(PDO::FETCH_ASSOC):array();while($s->nextRowset()){}return new RuntimeResult($rows);}
    function update($table,$data,$where) {$this->writes++;$fields=array();$clause=array();foreach($data as $key=>$value)$fields[]='`'.$key.'`=?';foreach($where as $key=>$value)$clause[]='`'.$key.'`=?';$this->query('UPDATE `'.$table.'` SET '.implode(',',$fields).' WHERE '.implode(' AND ',$clause),array_merge(array_values($data),array_values($where)));return true;}
    function insert($table,$data) {$this->writes++;$this->query('INSERT INTO `'.$table.'` (`'.implode('`,`',array_keys($data)).'`) VALUES ('.implode(',',array_fill(0,count($data),'?')).')',array_values($data));return true;}
    function select($value) {$this->select=$value;}
    function from($value) {$this->from=$value;}
    function where($key,$value=null) {if(is_array($key)){foreach($key as $k=>$v)$this->where($k,$v);return;}if($value===null){$this->where[]=$key;}else{$this->where[]=$key.'=?';$this->params[]=$value;}}
    function like($key,$value) {$this->where[]=$key.' LIKE ?';$this->params[]='%'.$value.'%';}
    function or_like($key,$value) {throw new Exception('BOUNDARY_UNSUPPORTED_OR_FILTER');}
    function order_by($key,$value) {$this->order=' ORDER BY '.$key.' '.($value==='DESC'?'DESC':'ASC');}
    function limit($n,$offset=0) {$this->limit=' LIMIT '.(int)$n.' OFFSET '.(int)$offset;}
    function get() {$sql='SELECT '.$this->select.' FROM '.$this->from.(count($this->where)?' WHERE '.implode(' AND ',$this->where):'').$this->order.$this->limit;$params=$this->params;$this->select='*';$this->from=null;$this->where=array();$this->params=array();$this->order='';$this->limit='';return $this->query($sql,$params);}
    function count_all_results() {return $this->get()->num_rows();}
}
class RuntimeLoader {public $view;public $data;function view($name,$data=array()) {$this->view=$name;$this->data=$data;}}
function base_url($value='') {return 'https://synthetic.example.invalid/'.$value;}
function rupiah($value) {return number_format($value,0,',','.');}
function terbilang($value) {return 'SYNTHETIC NUMBER WORDS';}
function object_without_constructor($class) {$r=new ReflectionClass($class);return $r->newInstanceWithoutConstructor();}
function module($object,$value) {$p=new ReflectionProperty(get_class($object),'module');$p->setAccessible(true);$p->setValue($object,$value);}
$config=json_decode(file_get_contents('/private/runtime.json'),true);
$case=json_decode($argv[1],true);$db=new RuntimeDb($config['baseline']);$scenario=$case['scenario'];$variant=$case['variant'];
$ref='PSSSYNTHETIC'.strtoupper(substr(sha1(uniqid('',true)),0,20));$nik='SYNTH00001';
// All inserted values are synthetic; this database is created afresh by the Node harness.
$db->pdo->exec('DELETE FROM m_simpanan_aktif;DELETE FROM trans_simpanan_pengajuan;DELETE FROM m_anggota');
$db->query("INSERT INTO m_anggota(id,nik_kar,nama_kar,bagian,kd_group,sim_sukarela,foto_ttd,bank_rek,no_rek,jabatan) VALUES(1,?,'SYNTHETIC MEMBER','1','SYNTH',100000,'SYNTHETIC_PROFILE_SIGNATURE.png','SYNTH BANK','SYNTH ACCOUNT','SYNTHETIC JOB')",array($nik));
$db->query("INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,status_notif,is_mobile,ttd,remarks) VALUES(?,'2026-10-29','OPEN','SIMPANAN SUKARELA',?,'SYNTHETIC SUBMISSION NAME','SYNTH DEPARTMENT',100000,150000,'11','2026',0,0,'pss-signature-synthetic-private','SYNTH')",array($ref,$nik));
$db->query("INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,is_mobile) VALUES('SYNTH-OLD','SIMPANAN SUKARELA',?,'SYNTHETIC MEMBER','SYNTH',100000,100000,1,0)",array($nik));
if($scenario==='late-failure')$db->query("CREATE TRIGGER pss_runtime_late_failure BEFORE UPDATE ON trans_simpanan_pengajuan FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='SYNTHETIC_LATE_FAILURE'");
$guarded=strpos($scenario,'guarded-')===0;
if($guarded){$db=new RuntimeDb($config['guarded']);$ref=$case['reference'];$nik=$case['nik'];$scenario=$scenario==='guarded-reject'?'reject':'approve';}
// installed-*: migration 001 present, deployed-style broad DML principal; '-hook-' installs the candidate entry hook.
if(strpos($scenario,'installed-')===0){$db=new RuntimeDb($config['installed']);$ref=$case['reference'];$nik=$case['nik'];$guarded=strpos($scenario,'-hook-')!==false;$scenario=strpos($scenario,'-reject')!==false?'reject':'approve';}
$input=new RuntimeInput(array('request'=>$scenario==='reject'?'REJECTED':'APPROVED','doc_no'=>$ref,'search_nik'=>'','jenis_select'=>'','status'=>'ALL','periode'=>'','tahun'=>'2026','tahun_select'=>'2026','type_select'=>'','bulan'=>'11','from'=>'','to'=>''));
$failure=null;$signal=null;$output='';$loader=new RuntimeLoader();
try {
 if($scenario==='print'){
  require '/source/ci2/application/modules/simpanan/controllers/simpanan_c.php';$controller=object_without_constructor('Simpanan_c');module($controller,'simpanan/');$controller->db=$db;$controller->input=$input;$controller->load=$loader;$_SERVER['REQUEST_METHOD']='GET';$controller->print_pengajuan_pdf();
 }else{
  if($guarded){
   require '/harness/PublicSavingsLegacyHook.php';
   $source=file_get_contents('/source/ci2/application/modules/'.$variant.'/controllers/pengajuan_mobile_c.php');
   $source=preg_replace('/function ajax_proses\(\)\s*\{/', 'function ajax_proses() { if ($this->publicSavingsHook->process($this->input->post(\'doc_no\'),$this->input->post(\'request\'))) return;', $source,1,$count);
   if($count!==1)throw new Exception('ENTRY_HOOK_MISMATCH');
   eval(substr($source,5));
  }else require '/source/ci2/application/modules/'.$variant.'/controllers/pengajuan_mobile_c.php';
  require '/source/ci2/application/modules/'.$variant.'/models/pengajuan_mobile_m.php';
  $model=object_without_constructor('Pengajuan_mobile_m');$model->db=$db;$model->input=$input;
  $controller=object_without_constructor('Pengajuan_mobile_c');module($controller,$variant.'/');$controller->db=$db;$controller->input=$input;$controller->session=new RuntimeSession();$controller->models=$model;
  if($guarded)$controller->publicSavingsHook=new PublicSavingsLegacyHook($db,array('enabled'=>true),function(){return 'synthetic-checker';},null);
  $_SERVER['REQUEST_METHOD']='POST';$_POST=array('draw'=>1,'start'=>0,'length'=>10,'search'=>array('value'=>''));
  ob_start();if($scenario==='list')$controller->ajax_list();else $controller->ajax_proses();$output=ob_get_clean();
 }
}catch(Exception $error){if(ob_get_level())ob_end_clean();$failure='SQL_FAILURE';$signal=preg_match('/\b1644 ([A-Z][A-Z_]{3,60})\b/',$error->getMessage(),$m)?$m[1]:get_class($error);}
if($scenario==='late-failure')$db->query('DROP TRIGGER pss_runtime_late_failure');
$header=$db->query('SELECT doc_status FROM trans_simpanan_pengajuan WHERE doc_no=?',array($ref))->row();$member=$db->query('SELECT sim_sukarela FROM m_anggota WHERE nik_kar=?',array($nik))->row();$active=$db->query('SELECT potongan_payroll FROM m_simpanan_aktif WHERE nik_kar=?',array($nik))->row();
echo json_encode(array('phpVersion'=>PHP_VERSION,'reference'=>$ref,'header'=>$header->doc_status,'deduction'=>(int)$member->sim_sukarela,'active'=>$active?(int)$active->potongan_payroll:0,'statementWrites'=>$db->writes,'failure'=>$failure,'signal'=>$signal,'list'=>json_decode($output,true),'view'=>$loader->view,'printData'=>$loader->data,'privateSignature'=>'pss-signature-synthetic-private','sqlStatements'=>$db->statements));
