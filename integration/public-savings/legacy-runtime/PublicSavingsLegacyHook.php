<?php
/** Production candidate only; no deployment wiring is installed.
 * Invoke after the real controller's existing authenticated menu checks.
 * authorize(action, reference) must return the session-bound actor only after
 * branch/role/maker-checker checks. resolveProof(reference, actor) must read the
 * exact persisted READY private PDF through an authenticated internal boundary.
 * Neither callback may accept public bearer tokens or caller-selected URLs.
 */
class PublicSavingsLegacyHook {
    private $db;private $enabled;private $authorize;private $resolveProof;
    function __construct($db,$config,$authorize,$resolveProof) {
        $this->db=$db;$this->enabled=isset($config['enabled']) && $config['enabled']===true;
        $this->authorize=$authorize;$this->resolveProof=$resolveProof;
    }
    private function actor($action,$reference) {
        if(!$this->enabled)throw new RuntimeException('PUBLIC_SAVINGS_DISABLED');
        if(!is_string($reference)||!preg_match('/^[a-zA-Z0-9-]{1,50}$/D',$reference)||!is_callable($this->authorize))throw new RuntimeException('PUBLIC_SAVINGS_FORBIDDEN');
        $actor=call_user_func($this->authorize,$action,$reference);
        if(!is_string($actor)||trim($actor)===''||strlen($actor)>50||preg_match('/[\r\n]/',$actor))throw new RuntimeException('PUBLIC_SAVINGS_FORBIDDEN');
        return $actor;
    }
    private function isPublic($reference) {
        return (bool)$this->db->query('SELECT reference FROM pss_application WHERE reference=?',array($reference))->row();
    }
    function process($reference,$requestedState) {
        $actor=$this->actor('PROCESS',$reference);
        if(!$this->isPublic($reference))return false;
        $actions=array('APPROVED'=>'APPROVE','REJECTED'=>'REJECT');
        if(!isset($actions[$requestedState]))throw new RuntimeException('PUBLIC_SAVINGS_INVALID_TRANSITION');
        try {$this->db->query('CALL pss_legacy_transition(?,?,?)',array($reference,$actions[$requestedState],$actor));}
        catch(Exception $error){throw new RuntimeException('PUBLIC_SAVINGS_COMMAND_FAILED');}
        echo json_encode(array('status'=>true,'is_mobile'=>0,'mess'=>'Data berhasil diupdate'));
        return true;
    }
    function printProof($reference) {
        $actor=$this->actor('PRINT',$reference);
        if(!$this->isPublic($reference))return false;
        if(!is_callable($this->resolveProof))throw new RuntimeException('PUBLIC_SAVINGS_PROOF_UNAVAILABLE');
        try {$proof=call_user_func($this->resolveProof,$reference,$actor);}
        catch(Exception $error){throw new RuntimeException('PUBLIC_SAVINGS_PROOF_UNAVAILABLE');}
        if(!is_array($proof)||!isset($proof['bytes'],$proof['sha256'])||!is_string($proof['bytes'])||strlen($proof['bytes'])>8388608||substr($proof['bytes'],0,5)!=='%PDF-'||!is_string($proof['sha256'])||!preg_match('/^[a-f0-9]{64}$/D',$proof['sha256'])||!hash_equals($proof['sha256'],hash('sha256',$proof['bytes'])))throw new RuntimeException('PUBLIC_SAVINGS_PROOF_UNAVAILABLE');
        if(PHP_SAPI!=='cli'){header('Content-Type: application/pdf');header('Cache-Control: private, no-store');header('Content-Disposition: inline; filename="pengajuan-simpanan.pdf"');header('X-Content-Type-Options: nosniff');}
        echo $proof['bytes'];
        return true;
    }
}
