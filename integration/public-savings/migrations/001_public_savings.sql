-- Public savings additive auxiliary schema and controlled legacy commands.
-- No existing m_* or trans_* table is created, dropped, renamed or rebuilt.
-- Apply only after preflight.mjs validates actual legacy signatures, engines,
-- duplicate identity/reference/master facts and explicit operator target authority.
-- This local engineering task validates only a sentinel-protected disposable copy.
-- SQL DDL is not transactional: record checksum, retry exact same version after failure.
-- Privilege changes are provisioned separately for distinct app/legacy principals.
CREATE TABLE IF NOT EXISTS pss_schema_migration(version VARCHAR(50) PRIMARY KEY,checksum CHAR(64) NOT NULL,applied_at DATETIME NOT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_installation(id CHAR(32) PRIMARY KEY, mode VARCHAR(30) NOT NULL CHECK(mode='LOCAL_SYNTHETIC')) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_member_control(member_id BIGINT PRIMARY KEY,active_reference VARCHAR(50) NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_member_evidence(member_id BIGINT PRIMARY KEY,contact_version VARCHAR(64) NOT NULL,contact_verified_ms BIGINT NOT NULL,eligible TINYINT NOT NULL,payroll_active TINYINT NOT NULL,branch VARCHAR(100) NOT NULL,deduction_evidence VARCHAR(20) NOT NULL DEFAULT 'CONFIG_VERIFIED' CHECK(deduction_evidence IN('CONFIG_VERIFIED','VERIFIED_NONE'))) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_notification_recipient(branch VARCHAR(100) NOT NULL,role VARCHAR(30) NOT NULL,destination VARCHAR(100) NOT NULL,active TINYINT NOT NULL,PRIMARY KEY(branch,role)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_calendar(year INT NOT NULL,month INT NOT NULL,status VARCHAR(20) NOT NULL,locked TINYINT NOT NULL,PRIMARY KEY(year,month)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_link(id CHAR(32) PRIMARY KEY,member_id BIGINT NOT NULL,token_hash CHAR(64) NOT NULL UNIQUE,contact_version VARCHAR(64) NOT NULL,expires_ms BIGINT NOT NULL,state VARCHAR(20) NOT NULL,created_ms BIGINT NOT NULL,failed_attempts INT NOT NULL DEFAULT 0,consumed_reference VARCHAR(50) NULL,review_cipher LONGTEXT NULL,review_hash CHAR(64) NULL,revoked_ms BIGINT NULL,consumed_ms BIGINT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_challenge(id CHAR(32) PRIMARY KEY,link_id CHAR(32) NOT NULL,code_hash CHAR(64) NULL,created_ms BIGINT NOT NULL,expires_ms BIGINT NOT NULL,used TINYINT NOT NULL DEFAULT 0,INDEX(link_id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_proof(id CHAR(32) PRIMARY KEY,link_id CHAR(32) NOT NULL,proof_hash CHAR(64) NOT NULL UNIQUE,contact_version VARCHAR(64) NOT NULL,created_ms BIGINT NOT NULL,expires_ms BIGINT NOT NULL,INDEX(link_id)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_application(reference VARCHAR(50) PRIMARY KEY,member_id BIGINT NOT NULL,link_id CHAR(32) NOT NULL UNIQUE,idempotency_key VARCHAR(128) NOT NULL,request_hash CHAR(64) NOT NULL,payload_hash CHAR(64) NOT NULL,snapshot_cipher LONGTEXT NOT NULL,snapshot_hash CHAR(64) NOT NULL,pdf_ref VARCHAR(100) NULL,pdf_digest CHAR(64) NULL,proof_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',created_ms BIGINT NOT NULL,verified_ms BIGINT NOT NULL,UNIQUE(member_id,idempotency_key)) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_outbox(id BIGINT AUTO_INCREMENT PRIMARY KEY,reference VARCHAR(50) NOT NULL,kind VARCHAR(30) NOT NULL,status VARCHAR(20) NOT NULL DEFAULT 'PENDING',attempts INT NOT NULL DEFAULT 0,last_error VARCHAR(100) NULL,next_attempt_ms BIGINT NOT NULL DEFAULT 0,UNIQUE(reference,kind)) ENGINE=InnoDB;
ALTER TABLE pss_outbox ADD COLUMN IF NOT EXISTS next_attempt_ms BIGINT NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS pss_audit(id BIGINT AUTO_INCREMENT PRIMARY KEY,member_id BIGINT NOT NULL,event VARCHAR(50) NOT NULL,reference VARCHAR(50) NULL,created_ms BIGINT NOT NULL) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS pss_command_guard(connection_id BIGINT PRIMARY KEY,reference VARCHAR(50) NOT NULL,action VARCHAR(20) NOT NULL) ENGINE=InnoDB;
DELIMITER $$
CREATE OR REPLACE TRIGGER pss_header_insert BEFORE INSERT ON trans_simpanan_pengajuan FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pss_command_guard WHERE connection_id=CONNECTION_ID() AND reference=NEW.doc_no AND action='CREATE_MOBILE') THEN
  IF NOT EXISTS(SELECT 1 FROM pss_application a JOIN pss_member_control c ON c.member_id=a.member_id JOIN m_anggota m ON m.id=a.member_id WHERE a.reference=NEW.doc_no AND c.active_reference=NEW.doc_no AND BINARY m.nik_kar=BINARY NEW.nik_kar)
   OR NOT(NEW.doc_status<=>'OPEN') OR NOT(NEW.jenis_simpanan<=>'SIMPANAN SUKARELA') OR NOT(NEW.is_mobile<=>0) THEN
   SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLIC_INSERT_BOUNDARY';
  END IF;
 END IF;
END$$
CREATE OR REPLACE TRIGGER pss_header_update BEFORE UPDATE ON trans_simpanan_pengajuan FOR EACH ROW
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pss_command_guard WHERE connection_id=CONNECTION_ID() AND reference=OLD.doc_no) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='CONTROLLED_LEGACY_COMMAND_REQUIRED';
 END IF;
END$$
CREATE OR REPLACE TRIGGER pss_header_delete BEFORE DELETE ON trans_simpanan_pengajuan FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='NO_HEADER_DELETE';
END$$
CREATE OR REPLACE TRIGGER pss_application_update BEFORE UPDATE ON pss_application FOR EACH ROW
BEGIN
 IF NOT(NEW.reference<=>OLD.reference) OR NOT(NEW.member_id<=>OLD.member_id) OR NOT(NEW.link_id<=>OLD.link_id) OR NOT(NEW.idempotency_key<=>OLD.idempotency_key) OR NOT(NEW.request_hash<=>OLD.request_hash) OR NOT(NEW.payload_hash<=>OLD.payload_hash) OR NOT(NEW.snapshot_cipher<=>OLD.snapshot_cipher) OR NOT(NEW.snapshot_hash<=>OLD.snapshot_hash) OR NOT(NEW.created_ms<=>OLD.created_ms) OR NOT(NEW.verified_ms<=>OLD.verified_ms) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_SUBMISSION';
 END IF;
 IF OLD.proof_status='READY' AND (NOT(NEW.pdf_ref<=>OLD.pdf_ref) OR NOT(NEW.pdf_digest<=>OLD.pdf_digest) OR NEW.proof_status<>'READY') THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_READY_PROOF';
 END IF;
 IF NEW.proof_status NOT IN('PENDING','READY') OR (NEW.proof_status='READY' AND (NEW.pdf_ref IS NULL OR NEW.pdf_digest IS NULL OR LENGTH(NEW.pdf_digest)<>64)) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PROOF_NOT_READY';
 END IF;
END$$
CREATE OR REPLACE TRIGGER pss_application_delete BEFORE DELETE ON pss_application FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='IMMUTABLE_SUBMISSION';
END$$
CREATE OR REPLACE PROCEDURE pss_legacy_transition(IN p_reference VARCHAR(50),IN p_action VARCHAR(20),IN p_actor VARCHAR(50)) SQL SECURITY DEFINER
main:BEGIN
 DECLARE v_member BIGINT DEFAULT NULL; DECLARE v_reserved VARCHAR(50); DECLARE v_id BIGINT; DECLARE v_nik VARCHAR(50); DECLARE v_name VARCHAR(50); DECLARE v_group VARCHAR(50); DECLARE v_status VARCHAR(50); DECLARE v_maker VARCHAR(50); DECLARE v_type VARCHAR(50); DECLARE v_old DECIMAL(18,2); DECLARE v_amount DECIMAL(18,2); DECLARE v_month INT; DECLARE v_year INT; DECLARE v_public INT; DECLARE v_ready INT; DECLARE v_count INT; DECLARE v_started BOOLEAN DEFAULT FALSE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN IF v_started THEN ROLLBACK; END IF; RESIGNAL; END;
 IF @@in_transaction THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COMMAND_OWNS_TRANSACTION'; END IF;
 IF p_reference IS NULL OR p_action IS NULL OR p_action NOT IN('APPROVE','REJECT','CANCEL') OR p_actor IS NULL OR CHAR_LENGTH(TRIM(p_actor))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_COMMAND'; END IF;
 START TRANSACTION; SET v_started=TRUE;
 SELECT m.id INTO v_member FROM trans_simpanan_pengajuan h JOIN m_anggota m ON BINARY m.nik_kar=BINARY h.nik_kar WHERE h.doc_no=p_reference;
 IF v_member IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REQUEST_NOT_FOUND'; END IF;
 SELECT active_reference INTO v_reserved FROM pss_member_control WHERE member_id=v_member FOR UPDATE;
 SELECT id,nik_kar,doc_status,cd_usr,jenis_simpanan,potongan_old,potongan,CAST(awal_potong_bulan AS UNSIGNED),CAST(awal_potong_tahun AS UNSIGNED) INTO v_id,v_nik,v_status,v_maker,v_type,v_old,v_amount,v_month,v_year FROM trans_simpanan_pengajuan WHERE doc_no=p_reference FOR UPDATE;
 SELECT nama_kar,kd_group INTO v_name,v_group FROM m_anggota WHERE id=v_member AND BINARY nik_kar=BINARY v_nik FOR UPDATE;
 IF NOT(v_status<=>'OPEN') OR NOT(v_reserved<=>p_reference) OR v_type<>'SIMPANAN SUKARELA' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_TRANSITION'; END IF;
 IF BINARY p_actor=BINARY v_maker THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MAKER_CHECKER_REQUIRED'; END IF;
 SELECT COUNT(*) INTO v_public FROM pss_application WHERE reference=p_reference;
 IF v_public>0 THEN
  SELECT COUNT(*) INTO v_ready FROM pss_application WHERE reference=p_reference AND proof_status='READY' AND pdf_ref IS NOT NULL AND pdf_digest IS NOT NULL;
  IF v_ready<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PROOF_NOT_READY'; END IF;
 END IF;
 IF p_action='APPROVE' THEN
  IF CHAR_LENGTH(v_nik)>10 OR v_amount IS NULL OR v_amount<10000 OR v_amount>5000000 OR MOD(v_amount,1000)<>0 OR v_month<1 OR v_month>12 OR v_year<1000 OR v_year>9999 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LEGACY_INCOMPATIBLE'; END IF;
  SELECT COUNT(*) INTO v_count FROM m_simpanan_aktif WHERE BINARY nik_kar=BINARY v_nik AND jenis_simpanan=v_type;
  IF v_count>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AMBIGUOUS_ACTIVE_MASTER'; END IF;
  IF v_count=0 THEN
   INSERT INTO m_simpanan_aktif(doc_no,jenis_simpanan,nik_kar,nama_kar,kd_group,potongan_old,potongan_payroll,status,cd,usr_cd,periode_start,periode_end,is_mobile) VALUES(p_reference,v_type,v_nik,v_name,v_group,COALESCE(v_old,0),v_amount,1,UTC_TIMESTAMP()+INTERVAL 7 HOUR,p_actor,STR_TO_DATE(CONCAT(v_year,'-',v_month,'-01'),'%Y-%c-%d'),STR_TO_DATE(CONCAT(v_year,'-12-31'),'%Y-%m-%d'),IF(v_public>0,0,1));
  ELSE
   UPDATE m_simpanan_aktif SET doc_no=p_reference,potongan_payroll=v_amount,status=1,ud=UTC_TIMESTAMP()+INTERVAL 7 HOUR,usr_ud=p_actor WHERE BINARY nik_kar=BINARY v_nik AND jenis_simpanan=v_type;
  END IF;
  UPDATE m_anggota SET sim_sukarela=v_amount WHERE id=v_member AND BINARY nik_kar=BINARY v_nik;
  IF ROW_COUNT()<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MEMBER_WRITE_FAILED'; END IF;
 END IF;
 INSERT INTO pss_command_guard VALUES(CONNECTION_ID(),p_reference,p_action);
 UPDATE trans_simpanan_pengajuan SET doc_status=CASE p_action WHEN 'APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,updated_at=UTC_TIMESTAMP()+INTERVAL 7 HOUR,ud_usr=p_actor WHERE id=v_id AND doc_status='OPEN';
 IF ROW_COUNT()<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='HEADER_WRITE_FAILED'; END IF;
 IF p_action<>'APPROVE' THEN UPDATE pss_member_control SET active_reference=NULL WHERE member_id=v_member AND active_reference=p_reference; END IF;
 INSERT INTO pss_audit(member_id,event,reference,created_ms) VALUES(v_member,CONCAT('LEGACY_',p_action),p_reference,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED));
 DELETE FROM pss_command_guard WHERE connection_id=CONNECTION_ID();
 COMMIT;
END$$
CREATE OR REPLACE PROCEDURE pss_mobile_create(IN p_member BIGINT,IN p_reference VARCHAR(50),IN p_amount BIGINT,IN p_month INT,IN p_year INT,IN p_actor VARCHAR(50)) SQL SECURITY DEFINER
BEGIN
 DECLARE v_reserved VARCHAR(50); DECLARE v_nik VARCHAR(50); DECLARE v_name VARCHAR(50); DECLARE v_section VARCHAR(255); DECLARE v_old DECIMAL(18,2); DECLARE v_count INT DEFAULT 0; DECLARE v_started BOOLEAN DEFAULT FALSE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN IF v_started THEN ROLLBACK; END IF; RESIGNAL; END;
 IF @@in_transaction THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COMMAND_OWNS_TRANSACTION'; END IF;
 IF p_reference IS NULL OR p_amount IS NULL OR p_month IS NULL OR p_year IS NULL OR p_reference NOT REGEXP '^SIMMOB[0-9]{12,30}$' OR p_amount<10000 OR p_amount>5000000 OR MOD(p_amount,1000)<>0 OR p_month<1 OR p_month>12 OR p_year<1000 OR p_year>9999 OR p_actor IS NULL OR CHAR_LENGTH(TRIM(p_actor))=0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_COMMAND'; END IF;
 START TRANSACTION;SET v_started=TRUE;
 SELECT active_reference INTO v_reserved FROM pss_member_control WHERE member_id=p_member FOR UPDATE;
 SELECT COUNT(*) INTO v_count FROM pss_member_control WHERE member_id=p_member;
 IF v_count<>1 OR v_reserved IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PENDING_CONFLICT'; END IF;
 SELECT m.nik_kar,m.nama_kar,b.name_bagian,m.sim_sukarela INTO v_nik,v_name,v_section,v_old FROM m_anggota m JOIN m_bagian b ON (BINARY CAST(b.id AS CHAR)=BINARY m.bagian OR BINARY b.name_bagian=BINARY m.bagian) WHERE m.id=p_member AND m.status_anggota='AKTIVE' FOR UPDATE;
 IF v_nik IS NULL OR CHAR_LENGTH(v_nik)>10 OR v_old IS NULL OR CHAR_LENGTH(v_section)>100 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MEMBER_INELIGIBLE'; END IF;
 UPDATE pss_member_control SET active_reference=p_reference WHERE member_id=p_member;
 INSERT INTO pss_command_guard VALUES(CONNECTION_ID(),p_reference,'CREATE_MOBILE');
 INSERT INTO trans_simpanan_pengajuan(doc_no,doc_date,doc_status,jenis_simpanan,nik_kar,nama,bagian,potongan_old,potongan,awal_potong_bulan,awal_potong_tahun,created_at,cd_usr,updated_at,ud_usr,status_notif,is_mobile) VALUES(p_reference,DATE(UTC_TIMESTAMP()+INTERVAL 7 HOUR),'OPEN','SIMPANAN SUKARELA',v_nik,v_name,v_section,v_old,p_amount,LPAD(p_month,2,'0'),p_year,UTC_TIMESTAMP()+INTERVAL 7 HOUR,p_actor,UTC_TIMESTAMP()+INTERVAL 7 HOUR,p_actor,0,1);
 INSERT INTO pss_audit(member_id,event,reference,created_ms) VALUES(p_member,'MOBILE_CREATE',p_reference,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED));
 DELETE FROM pss_command_guard WHERE connection_id=CONNECTION_ID();COMMIT;
END$$
CREATE OR REPLACE PROCEDURE pss_mobile_mutate(IN p_reference VARCHAR(50),IN p_action VARCHAR(20),IN p_amount BIGINT,IN p_actor VARCHAR(50)) SQL SECURITY DEFINER
BEGIN
 DECLARE v_member BIGINT DEFAULT NULL;DECLARE v_reserved VARCHAR(50);DECLARE v_status VARCHAR(50);DECLARE v_maker VARCHAR(50);DECLARE v_mobile INT;DECLARE v_public INT;DECLARE v_started BOOLEAN DEFAULT FALSE;
 DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN IF v_started THEN ROLLBACK; END IF;RESIGNAL; END;
 IF @@in_transaction THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='COMMAND_OWNS_TRANSACTION'; END IF;
 IF p_reference IS NULL OR p_action IS NULL OR p_action NOT IN('EDIT','CANCEL') OR p_actor IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_COMMAND'; END IF;
 START TRANSACTION;SET v_started=TRUE;
 SELECT m.id INTO v_member FROM trans_simpanan_pengajuan h JOIN m_anggota m ON BINARY m.nik_kar=BINARY h.nik_kar WHERE h.doc_no=p_reference;
 IF v_member IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='REQUEST_NOT_FOUND'; END IF;
 SELECT active_reference INTO v_reserved FROM pss_member_control WHERE member_id=v_member FOR UPDATE;
 SELECT doc_status,cd_usr,is_mobile INTO v_status,v_maker,v_mobile FROM trans_simpanan_pengajuan WHERE doc_no=p_reference FOR UPDATE;
 SELECT COUNT(*) INTO v_public FROM pss_application WHERE reference=p_reference;
 IF v_public<>0 OR v_mobile<>1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PUBLIC_MUTATION_FORBIDDEN'; END IF;
 IF NOT(v_status<=>'OPEN') OR NOT(v_reserved<=>p_reference) OR BINARY p_actor<>BINARY v_maker THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_TRANSITION'; END IF;
 IF p_action='EDIT' AND (p_amount IS NULL OR p_amount<10000 OR p_amount>5000000 OR MOD(p_amount,1000)<>0) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INVALID_AMOUNT'; END IF;
 INSERT INTO pss_command_guard VALUES(CONNECTION_ID(),p_reference,p_action);
 IF p_action='EDIT' THEN UPDATE trans_simpanan_pengajuan SET potongan=p_amount,updated_at=UTC_TIMESTAMP()+INTERVAL 7 HOUR,ud_usr=p_actor WHERE doc_no=p_reference;
 ELSE UPDATE trans_simpanan_pengajuan SET doc_status='REJECTED',updated_at=UTC_TIMESTAMP()+INTERVAL 7 HOUR,ud_usr=p_actor WHERE doc_no=p_reference;UPDATE pss_member_control SET active_reference=NULL WHERE member_id=v_member; END IF;
 INSERT INTO pss_audit(member_id,event,reference,created_ms) VALUES(v_member,CONCAT('MOBILE_',p_action),p_reference,CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000 AS UNSIGNED));
 DELETE FROM pss_command_guard WHERE connection_id=CONNECTION_ID();COMMIT;
END$$
DELIMITER ;
