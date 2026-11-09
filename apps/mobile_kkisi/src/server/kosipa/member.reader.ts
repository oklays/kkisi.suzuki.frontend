import type { MovementRaw, SavingsHeaderRef, TypeSummaryRaw, LoanHeaderRaw, ScheduleAggregate, ScheduleRowRaw, RecordedAmounts } from '@koperasi/domain/kosipa';
import { PAYROLL_COMPONENT_COLUMNS } from '@koperasi/domain/kosipa';
import type { BatchHeader } from '@koperasi/domain/kosipa';
import type { HeaderLookup, HistoryRow } from '@koperasi/application/kosipa/payroll';
import type { SavingsReader } from '@koperasi/application/kosipa/savings';
import { dec, query, txt, type Db } from './sql.ts';

// Member-scoped KOSIPA reads. Each statement mirrors the console adapter named in its comment (same tables, same status/
// header rules), restricted to one member's NIK keys. No method accepts a member identifier from a client.

export type ProfileRow = {
  id: number; nik: string; name: string; group: string | null; status: string | null; employment: string | null; exitOn: string | null; joinedOn: string | null;
  division: string | null; department: string | null; section: string | null; location: string | null; phone: string | null; email: string | null;
  address: string | null; limitToko: string; gajiMinus: string; limitPpob: string;
};

const zeroDate = (col: string) => `CASE WHEN ${col} IS NULL OR CAST(${col} AS CHAR) LIKE '0000-00-00%' THEN NULL ELSE DATE_FORMAT(${col}, '%Y-%m-%d') END`;

/** kosipa-member.repository.ts member(): by id AND by the session's NIK keys (a stale session can never read another row). */
export async function readProfile(db: Db, memberId: number, nikKeys: string[]): Promise<ProfileRow | null> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, nik_kar AS nik, nama_kar AS name, kd_group AS grp, status_anggota AS status, status_karyawan AS employment,
      ${zeroDate('tgl_keluar')} AS exit_on, ${zeroDate('tgl_daftar')} AS joined_on, divisi, dept, bagian, lokasi, no_telp AS phone, email,
      CONCAT_WS(', ', NULLIF(TRIM(alamat_tinggal), ''), NULLIF(TRIM(kelurahan_tinggal), ''), NULLIF(TRIM(kecamatan_tinggal), ''), NULLIF(TRIM(kabupaten_tinggal), '')) AS address,
      ${dec('limit_toko')} AS limit_toko, ${dec('gaji_minus')} AS gaji_minus, ${dec('limit_ppob')} AS limit_ppob
    FROM m_anggota WHERE id = ? AND nik_kar IN (?) LIMIT 1`, [memberId, nikKeys]);
  const x = r[0];
  if (!x) return null;
  return {
    id: Number(x.id), nik: x.nik ?? '', name: x.name ?? '', group: x.grp, status: x.status, employment: x.employment, exitOn: x.exit_on, joinedOn: x.joined_on,
    division: x.divisi, department: x.dept, section: x.bagian, location: x.lokasi, phone: x.phone, email: x.email, address: x.address || null,
    limitToko: x.limit_toko ?? '0.00', gajiMinus: x.gaji_minus ?? '0.00', limitPpob: x.limit_ppob ?? '0.00',
  };
}

/** kosipa-savings.repository.ts — the same three statements, implementing the application's SavingsReader port. */
export class MysqlSavingsReader implements SavingsReader {
  private readonly db: Db;
  constructor(db: Db) { this.db = db; }

  async typeSummary(nikKeys: string[]): Promise<TypeSummaryRaw[]> {
    const r = await query<{ type: string; doc_status: string; credit: string; debit: string; interest: string; n: string }>(this.db, `
      SELECT COALESCE(d.jenis_simpanan, h.jenis_simpanan, '(tanpa jenis)') AS type, COALESCE(h.doc_status, 'MISSING_HEADER') AS doc_status,
        CAST(COALESCE(SUM(COALESCE(d.kredit, 0) + COALESCE(d.kredit_cash, 0)), 0) AS DECIMAL(24,2)) AS credit,
        CAST(COALESCE(SUM(COALESCE(d.debit, 0)), 0) AS DECIMAL(24,2)) AS debit,
        CAST(COALESCE(SUM(COALESCE(d.jasa_kredit, 0)), 0) AS DECIMAL(24,2)) AS interest, COUNT(*) AS n
      FROM trans_simpanan_dtl d
      LEFT JOIN (SELECT doc_no, MAX(jenis_simpanan) AS jenis_simpanan, IF(COUNT(DISTINCT doc_status) = 1 AND COUNT(*) = 1, MAX(doc_status), 'AMBIGUOUS') AS doc_status
                 FROM trans_simpanan GROUP BY doc_no) h ON h.doc_no = d.doc_no
      WHERE d.nik_kar IN (?) GROUP BY 1, 2 LIMIT 200`, [nikKeys]);
    return r.map((x) => ({ type: x.type, headerStatus: x.doc_status, credit: x.credit, debit: x.debit, interest: x.interest, rows: Number(x.n) }));
  }

  async movements(nikKeys: string[], type: string | null, beforeId: number | null, limit: number): Promise<MovementRaw[]> {
    const params: unknown[] = [nikKeys];
    let extra = '';
    if (type) { extra += ' AND jenis_simpanan = ?'; params.push(type); }
    if (beforeId !== null) { extra += ' AND id < ?'; params.push(beforeId); }
    params.push(limit);
    const r = await query<{ id: string; doc_no: string | null; type: string | null; credit: string; cash: string; debit: string; interest: string; doc_status: string | null; remark: string | null }>(this.db, `
      SELECT id, doc_no, COALESCE(jenis_simpanan, '(tanpa jenis)') AS type, ${dec('kredit')} AS credit, ${dec('kredit_cash')} AS cash, ${dec('debit')} AS debit,
        ${dec('jasa_kredit')} AS interest, doc_status, remark_detail AS remark
      FROM trans_simpanan_dtl WHERE nik_kar IN (?)${extra} ORDER BY id DESC LIMIT ?`, params);
    return r.map((x) => ({ id: Number(x.id), docNo: x.doc_no ?? '', type: x.type ?? '(tanpa jenis)', credit: x.credit, cashCredit: x.cash, debit: x.debit, interest: x.interest, detailStatus: x.doc_status, remark: x.remark }));
  }

  async headersByDocNo(docNos: readonly string[]): Promise<SavingsHeaderRef[]> {
    if (docNos.length === 0) return [];
    const r = await query<{ doc_no: string; doc_date: string | null; doc_status: string | null; kind: string | null }>(this.db,
      `SELECT doc_no, ${txt('doc_date')} AS doc_date, doc_status, jenis_transaksi AS kind FROM trans_simpanan WHERE doc_no IN (?) ORDER BY id LIMIT ?`, [docNos, docNos.length * 5]);
    return docNos.map((docNo) => { const mine = r.filter((x) => x.doc_no === docNo); return { docNo, headerCount: mine.length, header: mine[0] ? { docDate: mine[0].doc_date, status: mine[0].doc_status, kind: mine[0].kind } : null }; });
  }
}

export type DeductionRow = { id: number; type: string; payroll: string; previous: string; status: number | null; periodStart: string | null; periodEnd: string | null };
/** m_simpanan_aktif: the payroll deduction KOSIPA keeps per savings type (written by the member form, legacy WP-02). */
export async function readActiveDeductions(db: Db, nikKeys: string[]): Promise<DeductionRow[]> {
  const r = await query<{ id: string; type: string | null; payroll: string; previous: string; status: string | null; ps: string | null; pe: string | null }>(db,
    `SELECT id, jenis_simpanan AS type, ${dec('potongan_payroll')} AS payroll, ${dec('potongan_old')} AS previous, status, ${txt('periode_start')} AS ps, ${txt('periode_end')} AS pe
     FROM m_simpanan_aktif WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 30`, [nikKeys]);
  return r.map((x) => ({ id: Number(x.id), type: x.type ?? '', payroll: x.payroll, previous: x.previous, status: x.status === null ? null : Number(x.status), periodStart: x.ps, periodEnd: x.pe }));
}

export type DeductionRequestRow = { id: number; docNo: string | null; docDate: string | null; status: string | null; type: string | null; previous: string; requested: string; startMonth: string | null; startYear: string | null };
export async function readDeductionRequests(db: Db, nikKeys: string[]): Promise<DeductionRequestRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, doc_no, ${txt('doc_date')} AS doc_date, doc_status, jenis_simpanan, ${dec('potongan_old')} AS previous, ${dec('potongan')} AS requested,
      awal_potong_bulan, awal_potong_tahun FROM trans_simpanan_pengajuan WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 10`, [nikKeys]);
  return r.map((x) => ({ id: Number(x.id), docNo: x.doc_no, docDate: x.doc_date, status: x.doc_status, type: x.jenis_simpanan, previous: x.previous ?? '0.00', requested: x.requested ?? '0.00', startMonth: x.awal_potong_bulan, startYear: x.awal_potong_tahun }));
}

export type WithdrawalRow = { id: number; docNo: string | null; docDate: string | null; status: string | null; type: string | null; amount: string };
export async function readWithdrawals(db: Db, nikKeys: string[]): Promise<WithdrawalRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, doc_no, ${txt('doc_date')} AS doc_date, doc_status, jenis_simpanan, ${dec('total_penarikan')} AS amount
    FROM trans_simpanan_penarikan WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 20`, [nikKeys]);
  return r.map((x) => ({ id: Number(x.id), docNo: x.doc_no, docDate: x.doc_date, status: x.doc_status, type: x.jenis_simpanan, amount: x.amount ?? '0.00' }));
}

// ------------------------------------------------------------------------------------------------------------------ loans
const LOAN_HEADER = `id, doc_no, ${txt('doc_date')} AS doc_date, jenis_pinjaman AS type, jenis_suku_bunga AS method, biaya_suku_bunga AS rate, nik, nama AS name, bank_pembiaya AS financier,
  doc_status, status_pencairan AS disbursement, status_bayar AS repayment,
  ${dec('plan_pinjaman')} AS plan_principal, ${dec('actual_pinjaman')} AS actual_principal, ${dec('plan_angsuran')} AS plan_installment, ${dec('actual_angsuran')} AS actual_installment,
  plan_jangka_waktu AS plan_months, actual_jangka_waktu AS actual_months, ${txt('awal_pinjaman')} AS start_date, ${txt('akhir_pinjaman')} AS end_date, ${txt('tgl_pencairan')} AS disbursed_date,
  ${dec('nominal_pencairan')} AS disbursed_amount, ${dec('biaya_admin')} AS admin_fee, ${dec('biaya_asuransi')} AS insurance_fee, ${dec('total_potongan')} AS total_deduction, ${dec('total_diterima')} AS total_received,
  pelunasan_status AS settlement_status, ${txt('pelunasan_date')} AS settlement_date, ${dec('pelunasan_total')} AS settlement_total, status_roll_over AS roll_over`;

/** kosipa-loan.repository.ts HEADER, by the member's NIK keys (newest first). */
export async function readLoans(db: Db, nikKeys: string[], limit = 20): Promise<LoanHeaderRaw[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT ${LOAN_HEADER} FROM trans_pinjaman WHERE nik IN (?) ORDER BY doc_date DESC, id DESC LIMIT ?`, [nikKeys, limit]);
  const n = (v: string | null) => (v === null ? null : Number(v));
  return r.map((x) => ({
    id: Number(x.id), docNo: x.doc_no ?? '', docDate: x.doc_date, type: x.type, method: x.method, rate: x.rate, nik: x.nik ?? '', name: x.name, financier: x.financier,
    docStatus: x.doc_status, disbursement: x.disbursement, repayment: x.repayment,
    planPrincipal: x.plan_principal ?? '0.00', actualPrincipal: x.actual_principal ?? '0.00', planInstallment: x.plan_installment ?? '0.00', actualInstallment: x.actual_installment ?? '0.00',
    planMonths: n(x.plan_months), actualMonths: n(x.actual_months), startDate: x.start_date, endDate: x.end_date, disbursedDate: x.disbursed_date, disbursedAmount: x.disbursed_amount ?? '0.00',
    adminFee: x.admin_fee ?? '0.00', insuranceFee: x.insurance_fee ?? '0.00', totalDeduction: x.total_deduction ?? '0.00', totalReceived: x.total_received ?? '0.00',
    settlementStatus: x.settlement_status, settlementDate: x.settlement_date, settlementTotal: x.settlement_total ?? '0.00', rollOver: x.roll_over,
  }));
}

/**
 * kosipa-loan.repository.ts scheduleAggregate(). OWNERSHIP: callers pass only a doc_no taken from readLoans() for the same
 * session in the same request (features/loans/services/loans.server.ts), never a doc_no from the URL.
 */
export async function readScheduleAggregate(db: Db, docNo: string): Promise<ScheduleAggregate> {
  const [r] = await query<Record<string, string | null>>(db, `SELECT COUNT(*) AS n, COUNT(DISTINCT COALESCE(ke_cicilan, 0)) AS distinct_no, MIN(ke_cicilan) AS min_no, MAX(ke_cicilan) AS max_no,
      CAST(COALESCE(SUM(pokok_cicilan), 0) AS DECIMAL(24,2)) AS principal, CAST(COALESCE(SUM(bunga_cicilan), 0) AS DECIMAL(24,2)) AS interest, CAST(COALESCE(SUM(angsuran_cicilan), 0) AS DECIMAL(24,2)) AS total,
      SUM(status_cicilan = 'Bayar') AS paid_rows, SUM(status_cicilan = 'Belum Bayar') AS unpaid_rows, SUM(status_cicilan IS NULL OR status_cicilan NOT IN ('Bayar', 'Belum Bayar')) AS other_rows,
      CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Bayar' THEN pokok_cicilan END), 0) AS DECIMAL(24,2)) AS paid_principal,
      CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Belum Bayar' THEN pokok_cicilan END), 0) AS DECIMAL(24,2)) AS unpaid_principal,
      CAST(COALESCE(SUM(CASE WHEN status_cicilan = 'Belum Bayar' THEN angsuran_cicilan END), 0) AS DECIMAL(24,2)) AS unpaid_total,
      SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) LIKE '0000-00-00%') AS zero_due, SUM(tgl_cicilan IS NULL) AS missing_due,
      SUM(tgl_cicilan IS NOT NULL AND CAST(tgl_cicilan AS CHAR) NOT LIKE '0000-00-00%' AND CAST(SUBSTRING(CAST(tgl_cicilan AS CHAR), 1, 4) AS UNSIGNED) NOT BETWEEN 1990 AND 2100) AS implausible_due,
      SUM(ROUND(COALESCE(angsuran_cicilan, 0), 2) <> ROUND(COALESCE(pokok_cicilan, 0) + COALESCE(bunga_cicilan, 0), 2)) AS component_mismatch,
      SUM(status_cicilan = 'Bayar' AND (tgl_bayar IS NULL OR CAST(tgl_bayar AS CHAR) LIKE '0000-00-00%')) AS paid_no_date
    FROM trans_pinjaman_dtl WHERE doc_no = ?`, [docNo]);
  const n = (v: string | null | undefined) => Number(v ?? 0);
  return {
    rows: n(r?.n), distinctNo: n(r?.distinct_no), minNo: r?.min_no == null ? null : Number(r.min_no), maxNo: r?.max_no == null ? null : Number(r.max_no),
    principalSum: r?.principal ?? '0.00', interestSum: r?.interest ?? '0.00', totalSum: r?.total ?? '0.00', paidRows: n(r?.paid_rows), unpaidRows: n(r?.unpaid_rows), otherStatusRows: n(r?.other_rows),
    paidPrincipal: r?.paid_principal ?? '0.00', unpaidPrincipal: r?.unpaid_principal ?? '0.00', unpaidTotal: r?.unpaid_total ?? '0.00',
    zeroDue: n(r?.zero_due), missingDue: n(r?.missing_due), implausibleDue: n(r?.implausible_due), componentMismatch: n(r?.component_mismatch), paidWithoutPaidDate: n(r?.paid_no_date),
  };
}

/** kosipa-loan.repository.ts scheduleRows() (first page). Same ownership rule as readScheduleAggregate. */
export async function readScheduleRows(db: Db, docNo: string, limit: number): Promise<ScheduleRowRaw[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, ke_cicilan AS ke, ${txt('tgl_cicilan')} AS due, ${txt('tgl_bayar')} AS paid, ${dec('pokok_cicilan')} AS principal,
      ${dec('bunga_cicilan')} AS interest, ${dec('angsuran_cicilan')} AS total, status_cicilan AS status, type_cicilan AS type, blokir AS blocked, rool_over AS roll_over, doc_no_cicilan AS cicilan_doc_no
    FROM trans_pinjaman_dtl WHERE doc_no = ? ORDER BY COALESCE(ke_cicilan, 0), id LIMIT ?`, [docNo, limit]);
  return r.map((x) => ({
    id: Number(x.id), installmentNo: x.ke === null ? null : Number(x.ke), dueRaw: x.due, paidRaw: x.paid, principal: x.principal ?? '0.00', interest: x.interest ?? '0.00', total: x.total ?? '0.00',
    status: x.status, type: x.type, blocked: x.blocked === null ? null : Number(x.blocked), rollOver: x.roll_over === null ? null : Number(x.roll_over), cicilanDocNo: x.cicilan_doc_no,
  }));
}

export type LoanApplicationRow = { id: number; docNo: string | null; docDate: string | null; status: string | null; disbursement: string | null; type: string | null; amount: string; months: number | null; rejection: string | null; online: boolean };
/** trans_pinjaman_pengajuan: applications (mobile and staff-entered) before they become a trans_pinjaman document. */
export async function readLoanApplications(db: Db, nikKeys: string[]): Promise<LoanApplicationRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, doc_no, ${txt('doc_date')} AS doc_date, doc_status, status_pencairan, jenis_pinjaman, ${dec('total_pinjaman')} AS amount,
      lama_angsuran, keterangan_riject, is_online FROM trans_pinjaman_pengajuan WHERE nik_kar IN (?) ORDER BY id DESC LIMIT 10`, [nikKeys]);
  return r.map((x) => ({ id: Number(x.id), docNo: x.doc_no, docDate: x.doc_date, status: x.doc_status, disbursement: x.status_pencairan, type: x.jenis_pinjaman, amount: x.amount ?? '0.00',
    months: x.lama_angsuran === null ? null : Number(x.lama_angsuran), rejection: x.keterangan_riject, online: Number(x.is_online) === 1 }));
}

export type LoanProductRow = { id: number; name: string; minAmount: string; maxAmount: string; minMonths: number; maxMonths: number; ratePercent: string; method: string | null };
/** Master Pinjaman Mobile (m_pinjaman_mobile, status 1) + the interest method of the same-named m_jenis_pinjaman. Not personal data. */
export async function readLoanProducts(db: Db): Promise<LoanProductRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT m.id, m.jenis_pinjaman AS name, ${dec('m.min_nominal')} AS min_amount, ${dec('m.max_nominal')} AS max_amount, m.min_jw, m.max_jw, m.jasa,
      (SELECT j.jenis_bunga FROM m_jenis_pinjaman j WHERE j.jenis_pinjaman_name = m.jenis_pinjaman AND j.is_active = '1' ORDER BY j.id LIMIT 1) AS method
    FROM m_pinjaman_mobile m WHERE m.status = 1 ORDER BY m.id LIMIT 20`);
  return r.map((x) => ({ id: Number(x.id), name: x.name ?? '', minAmount: x.min_amount ?? '0.00', maxAmount: x.max_amount ?? '0.00', minMonths: Number(x.min_jw ?? 0), maxMonths: Number(x.max_jw ?? 0), ratePercent: x.jasa ?? '', method: x.method }));
}

// ---------------------------------------------------------------------------------------------------------------- payroll
const AMOUNT_COLUMNS = [...PAYROLL_COMPONENT_COLUMNS, 'total_potongan', 'potongan_toko'] as const;
for (const c of AMOUNT_COLUMNS) if (!/^[A-Za-z0-9_]{1,64}$/.test(c)) throw new Error('unsafe payroll column');
const AMOUNT_SELECT = AMOUNT_COLUMNS.map((c, i) => `CAST(COALESCE(\`${c}\`, 0) AS DECIMAL(24,4)) AS c${i}`).join(', ');

export type PayrollRow = HistoryRow & { amounts: RecordedAmounts };
/** kosipa-payroll.repository.ts memberHistory(), plus every component so the domain can break the newest row down. */
export async function readPayrollRows(db: Db, nikKeys: string[], limit: number): Promise<PayrollRow[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, periode AS doc_no, ${AMOUNT_SELECT} FROM trans_potongan_matrix WHERE nik_kar IN (?) ORDER BY id DESC LIMIT ?`, [nikKeys, limit]);
  return r.map((x) => {
    const at = (name: (typeof AMOUNT_COLUMNS)[number]) => x[`c${AMOUNT_COLUMNS.indexOf(name)}`] ?? '0.0000';
    const amounts = Object.fromEntries(AMOUNT_COLUMNS.map((c) => [c, at(c)])) as RecordedAmounts;
    return { id: Number(x.id), docNo: x.doc_no ?? '', total: at('total_potongan'), toko: { TOKO_TAMBUN: at('TOKO_TAMBUN'), TOKO_MJ: at('TOKO_MJ'), TOKO_GIIC: at('TOKO_GIIC') }, amounts };
  });
}

/** kosipa-payroll.repository.ts headersByDocNo(). Batch headers are shared (not personal); looked up only for the member's rows. */
export async function readPayrollHeaders(db: Db, docNos: readonly string[]): Promise<HeaderLookup[]> {
  if (docNos.length === 0) return [];
  const r = await query<Record<string, string | null>>(db, `SELECT id, doc_no, kd_group AS grp, doc_status AS status, periode_th AS th, periode_bl AS bl, ${txt('periode_potongan')} AS period_date,
      ${txt('doc_date')} AS doc_date, ${txt('tgl_cair')} AS cash_date, CAST(total AS DECIMAL(24,4)) AS total, CAST(total_cair AS DECIMAL(24,4)) AS cash_total
    FROM trans_potongan_bulanan WHERE doc_no IN (?) ORDER BY id LIMIT ?`, [docNos, docNos.length * 5]);
  const header = (x: Record<string, string | null>): BatchHeader => ({ id: Number(x.id), docNo: x.doc_no ?? '', group: x.grp, status: x.status, periodYear: x.th, periodMonth: x.bl, periodDate: x.period_date,
    docDate: x.doc_date, cashDate: x.cash_date, headerTotal: x.total, cashTotal: x.cash_total, createdBy: null, updatedBy: null });
  return docNos.map((docNo) => { const mine = r.filter((x) => x.doc_no === docNo); return { docNo, headerCount: mine.length, header: mine[0] ? header(mine[0]) : null }; });
}

// -------------------------------------------------------------------------------------------------------------------- SHU
export const SHU_FIELDS = ['jasa_simpanan', 'jasa_transaksi_usaha', 'total_shu', 'total_shu_pembulatan', 'jasa_simpanan_sukarela', 'pembulatan_sukarela', 'pendapatan_shu'] as const;
export type ShuRow = { docNo: string; year: string; values: Record<(typeof SHU_FIELDS)[number], string> };
/** trans_shu_dtl rows of the member whose header (trans_shu) is published (publish = 1). Recorded values only; nothing recomputed. */
export async function readShu(db: Db, nikKeys: string[]): Promise<ShuRow[]> {
  const detail = await query<Record<string, string | null>>(db, `SELECT doc_no, periode_th, ${SHU_FIELDS.map((f) => `${dec(f)} AS ${f}`).join(', ')}
    FROM trans_shu_dtl WHERE nik_kar IN (?) ORDER BY periode_th DESC, id DESC LIMIT 20`, [nikKeys]);
  const docNos = [...new Set(detail.map((d) => d.doc_no).filter((d): d is string => !!d))];
  if (docNos.length === 0) return [];
  const published = new Set((await query<{ doc_no: string }>(db, 'SELECT doc_no FROM trans_shu WHERE doc_no IN (?) AND publish = 1 LIMIT ?', [docNos, docNos.length * 5])).map((h) => h.doc_no));
  const seen = new Set<string>();
  const out: ShuRow[] = [];
  for (const d of detail) {
    if (!d.doc_no || !published.has(d.doc_no) || !d.periode_th || seen.has(d.periode_th)) continue;
    seen.add(d.periode_th);
    out.push({ docNo: d.doc_no, year: d.periode_th, values: Object.fromEntries(SHU_FIELDS.map((f) => [f, d[f] ?? '0.00'])) as ShuRow['values'] });
  }
  return out;
}
