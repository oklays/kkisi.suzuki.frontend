<?php
require __DIR__.'/PublicSavingsLegacyHook.php';
class HookResult {function row(){return (object)array('reference'=>'PSS-SYNTH');}}
class HookDb {public $queries=array();function query($sql,$args=array()){$this->queries[]=array($sql,$args);return new HookResult();}}
function check($condition){if(!$condition)throw new Exception('ASSERTION_FAILED');}
function fails($callback,$code){try{$callback();throw new Exception('EXPECTED_FAILURE');}catch(RuntimeException $e){check($e->getMessage()===$code);}}
$db=new HookDb();$actor=function($action,$ref){return 'authenticated-synthetic-checker';};
$off=new PublicSavingsLegacyHook($db,array(),$actor,null);fails(function()use($off){$off->process('PSS-SYNTH','APPROVED');},'PUBLIC_SAVINGS_DISABLED');
$denied=new PublicSavingsLegacyHook($db,array('enabled'=>true),function(){return null;},null);fails(function()use($denied){$denied->process('PSS-SYNTH','APPROVED');},'PUBLIC_SAVINGS_FORBIDDEN');
$hook=new PublicSavingsLegacyHook($db,array('enabled'=>true),$actor,null);
ob_start();check($hook->process('PSS-SYNTH','APPROVED')===true);$output=json_decode(ob_get_clean(),true);check($output['status']===true);$last=end($db->queries);check($last[0]==='CALL pss_legacy_transition(?,?,?)');check($last[1]===array('PSS-SYNTH','APPROVE','authenticated-synthetic-checker'));
fails(function()use($hook){$hook->process('PSS-SYNTH','POSTING');},'PUBLIC_SAVINGS_INVALID_TRANSITION');
fails(function()use($hook){$hook->printProof('PSS-SYNTH');},'PUBLIC_SAVINGS_PROOF_UNAVAILABLE');
$pdf="%PDF-1.7\nSYNTHETIC_FROZEN_PROOF";
$print=new PublicSavingsLegacyHook($db,array('enabled'=>true),$actor,function($ref)use($pdf){return array('bytes'=>$pdf,'sha256'=>hash('sha256',$pdf));});ob_start();check($print->printProof('PSS-SYNTH')===true);check(ob_get_clean()===$pdf);
$bad=new PublicSavingsLegacyHook($db,array('enabled'=>true),$actor,function()use($pdf){return array('bytes'=>$pdf,'sha256'=>str_repeat('0',64));});fails(function()use($bad){$bad->printProof('PSS-SYNTH');},'PUBLIC_SAVINGS_PROOF_UNAVAILABLE');
echo "HOOK_TESTS_PASS\n";
