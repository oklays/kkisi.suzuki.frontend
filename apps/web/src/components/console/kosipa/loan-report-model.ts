import type { LoanMonth, LoanReport, LoanStatusLine } from '@koperasi/domain/kosipa';

export type KnownDocStatus = 'APPROVED' | 'POSTING' | 'OPEN' | 'REJECTED';
export type KnownRepaymentStatus = 'LUNAS' | 'BELUM LUNAS';

export type StatusBucketMetric = {
  count: number;
  plan4: number;
};

export type DocStatusBreakdown = {
  APPROVED: StatusBucketMetric;
  POSTING: StatusBucketMetric;
  OPEN: StatusBucketMetric;
  REJECTED: StatusBucketMetric;
  OTHER: StatusBucketMetric;
};

export type RepaymentStatusBreakdown = {
  LUNAS: StatusBucketMetric;
  BELUM_LUNAS: StatusBucketMetric;
  OTHER: StatusBucketMetric;
};

export type StatusMatrixRowKey = KnownDocStatus | 'OTHER';

export type StatusMatrixRow = {
  key: StatusMatrixRowKey;
  label: string;
  rawStatus: string;
  lunas: StatusBucketMetric;
  belumLunas: StatusBucketMetric;
  otherRepayment: StatusBucketMetric;
  total: StatusBucketMetric;
};

export type MonthStatusAnomaly = {
  kind: 'REJECTED_BUT_SETTLED' | 'SETTLED_NOT_APPROVED' | 'UNKNOWN_STATUS';
  docStatus: string | null;
  repayment: string | null;
  count: number;
  plan4: number;
  description: string;
};

export type AggregatedLoanMonth = {
  bucket: string;
  count: number;
  plan4: number;
  lines: LoanStatusLine[];
  docStatus: DocStatusBreakdown;
  repayment: RepaymentStatusBreakdown;
  approvedOrPostingCount: number;
  matrix: {
    rows: StatusMatrixRow[];
    totals: {
      lunas: StatusBucketMetric;
      belumLunas: StatusBucketMetric;
      otherRepayment: StatusBucketMetric;
      grand: StatusBucketMetric;
    };
  };
  anomalies: MonthStatusAnomaly[];
  reconciled: boolean;
};

export type AggregatedLoanReport = {
  year: number | null;
  years: number[];
  months: AggregatedLoanMonth[];
  totals: {
    count: number;
    plan4: number;
    docStatus: DocStatusBreakdown;
    repayment: RepaymentStatusBreakdown;
    inProgressCount: number;
    inProgressPlan4: number;
  };
  kpis: {
    totalDocs: number;
    totalPlan4: number;
    approvedDocs: number;
    approvedPlan4: number;
    approvedPct: string | null;
    inProgressDocs: number;
    inProgressPlan4: number;
    inProgressPct: string | null;
    rejectedDocs: number;
    rejectedPlan4: number;
    rejectedPct: string | null;
  };
  hasUnknownDocStatus: boolean;
  hasUnknownRepaymentStatus: boolean;
  allMonthsReconciled: boolean;
};

const emptyMetric = (): StatusBucketMetric => ({ count: 0, plan4: 0 });

const addMetric = (target: StatusBucketMetric, count: number, plan4: number): void => {
  target.count += count;
  target.plan4 += plan4;
};

export function formatSharePercent(part: number, total: number): string | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  const pct = (part / total) * 100;
  return `${pct.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const MATRIX_ROW_META: readonly { key: KnownDocStatus; label: string; rawStatus: string }[] = [
  { key: 'APPROVED', label: 'Disetujui (Approved)', rawStatus: 'APPROVED' },
  { key: 'POSTING', label: 'Posting', rawStatus: 'POSTING' },
  { key: 'OPEN', label: 'Terbuka (Open)', rawStatus: 'OPEN' },
  { key: 'REJECTED', label: 'Ditolak (Rejected)', rawStatus: 'REJECTED' },
];

export function aggregateMonthStatus(month: LoanMonth): AggregatedLoanMonth {
  const docStatus: DocStatusBreakdown = {
    APPROVED: emptyMetric(),
    POSTING: emptyMetric(),
    OPEN: emptyMetric(),
    REJECTED: emptyMetric(),
    OTHER: emptyMetric(),
  };

  const repayment: RepaymentStatusBreakdown = {
    LUNAS: emptyMetric(),
    BELUM_LUNAS: emptyMetric(),
    OTHER: emptyMetric(),
  };

  const matrixMap = new Map<StatusMatrixRowKey, StatusMatrixRow>();
  for (const meta of MATRIX_ROW_META) {
    matrixMap.set(meta.key, {
      key: meta.key,
      label: meta.label,
      rawStatus: meta.rawStatus,
      lunas: emptyMetric(),
      belumLunas: emptyMetric(),
      otherRepayment: emptyMetric(),
      total: emptyMetric(),
    });
  }
  const otherRow: StatusMatrixRow = {
    key: 'OTHER',
    label: 'Tanpa Status / Lainnya',
    rawStatus: 'LAINNYA',
    lunas: emptyMetric(),
    belumLunas: emptyMetric(),
    otherRepayment: emptyMetric(),
    total: emptyMetric(),
  };

  const anomalies: MonthStatusAnomaly[] = [];

  for (const line of month.lines) {
    const dKey: StatusMatrixRowKey =
      line.docStatus === 'APPROVED' ||
      line.docStatus === 'POSTING' ||
      line.docStatus === 'OPEN' ||
      line.docStatus === 'REJECTED'
        ? line.docStatus
        : 'OTHER';

    addMetric(docStatus[dKey], line.count, line.plan4);

    if (line.repayment === 'LUNAS') {
      addMetric(repayment.LUNAS, line.count, line.plan4);
    } else if (line.repayment === 'BELUM LUNAS') {
      addMetric(repayment.BELUM_LUNAS, line.count, line.plan4);
    } else {
      addMetric(repayment.OTHER, line.count, line.plan4);
    }

    const row = dKey === 'OTHER' ? otherRow : matrixMap.get(dKey)!;
    if (line.repayment === 'LUNAS') {
      addMetric(row.lunas, line.count, line.plan4);
    } else if (line.repayment === 'BELUM LUNAS') {
      addMetric(row.belumLunas, line.count, line.plan4);
    } else {
      addMetric(row.otherRepayment, line.count, line.plan4);
    }
    addMetric(row.total, line.count, line.plan4);

    if (line.count > 0) {
      if (line.docStatus === 'REJECTED' && line.repayment === 'LUNAS') {
        anomalies.push({
          kind: 'REJECTED_BUT_SETTLED',
          docStatus: line.docStatus,
          repayment: line.repayment,
          count: line.count,
          plan4: line.plan4,
          description: 'Dokumen tercatat REJECTED namun memiliki status pelunasan LUNAS.',
        });
      } else if (
        line.docStatus !== 'APPROVED' &&
        line.docStatus !== 'REJECTED' &&
        line.repayment === 'LUNAS'
      ) {
        anomalies.push({
          kind: 'SETTLED_NOT_APPROVED',
          docStatus: line.docStatus,
          repayment: line.repayment,
          count: line.count,
          plan4: line.plan4,
          description: `Dokumen berstatus ${line.docStatus ?? 'tanpa status'} (belum APPROVED) namun tercatat LUNAS.`,
        });
      }
      if (dKey === 'OTHER' || (line.repayment !== 'LUNAS' && line.repayment !== 'BELUM LUNAS')) {
        anomalies.push({
          kind: 'UNKNOWN_STATUS',
          docStatus: line.docStatus,
          repayment: line.repayment,
          count: line.count,
          plan4: line.plan4,
          description: `Kombinasi status di luar daftar baku (${line.docStatus ?? 'NULL'} / ${line.repayment ?? 'NULL'}).`,
        });
      }
    }
  }

  const rows: StatusMatrixRow[] = [...MATRIX_ROW_META.map((m) => matrixMap.get(m.key)!)];
  if (otherRow.total.count > 0 || otherRow.total.plan4 !== 0) {
    rows.push(otherRow);
  }

  const docSumCount =
    docStatus.APPROVED.count +
    docStatus.POSTING.count +
    docStatus.OPEN.count +
    docStatus.REJECTED.count +
    docStatus.OTHER.count;
  const repSumCount =
    repayment.LUNAS.count + repayment.BELUM_LUNAS.count + repayment.OTHER.count;
  const matrixSumCount = rows.reduce((s, r) => s + r.total.count, 0);

  const reconciled =
    docSumCount === month.count &&
    repSumCount === month.count &&
    matrixSumCount === month.count;

  return {
    bucket: month.bucket,
    count: month.count,
    plan4: month.plan4,
    lines: month.lines,
    docStatus,
    repayment,
    approvedOrPostingCount: docStatus.APPROVED.count + docStatus.POSTING.count,
    matrix: {
      rows,
      totals: {
        lunas: { ...repayment.LUNAS },
        belumLunas: { ...repayment.BELUM_LUNAS },
        otherRepayment: { ...repayment.OTHER },
        grand: { count: month.count, plan4: month.plan4 },
      },
    },
    anomalies,
    reconciled,
  };
}

export function aggregateYearLoanReport(report: LoanReport): AggregatedLoanReport {
  const months = report.months.map(aggregateMonthStatus);

  const docStatus: DocStatusBreakdown = {
    APPROVED: emptyMetric(),
    POSTING: emptyMetric(),
    OPEN: emptyMetric(),
    REJECTED: emptyMetric(),
    OTHER: emptyMetric(),
  };

  const repayment: RepaymentStatusBreakdown = {
    LUNAS: emptyMetric(),
    BELUM_LUNAS: emptyMetric(),
    OTHER: emptyMetric(),
  };

  let totalDocs = 0;
  let totalPlan4 = 0;

  for (const m of months) {
    totalDocs += m.count;
    totalPlan4 += m.plan4;
    addMetric(docStatus.APPROVED, m.docStatus.APPROVED.count, m.docStatus.APPROVED.plan4);
    addMetric(docStatus.POSTING, m.docStatus.POSTING.count, m.docStatus.POSTING.plan4);
    addMetric(docStatus.OPEN, m.docStatus.OPEN.count, m.docStatus.OPEN.plan4);
    addMetric(docStatus.REJECTED, m.docStatus.REJECTED.count, m.docStatus.REJECTED.plan4);
    addMetric(docStatus.OTHER, m.docStatus.OTHER.count, m.docStatus.OTHER.plan4);

    addMetric(repayment.LUNAS, m.repayment.LUNAS.count, m.repayment.LUNAS.plan4);
    addMetric(repayment.BELUM_LUNAS, m.repayment.BELUM_LUNAS.count, m.repayment.BELUM_LUNAS.plan4);
    addMetric(repayment.OTHER, m.repayment.OTHER.count, m.repayment.OTHER.plan4);
  }

  const inProgressCount = docStatus.POSTING.count + docStatus.OPEN.count;
  const inProgressPlan4 = docStatus.POSTING.plan4 + docStatus.OPEN.plan4;

  return {
    year: report.year,
    years: report.years,
    months,
    totals: {
      count: totalDocs,
      plan4: totalPlan4,
      docStatus,
      repayment,
      inProgressCount,
      inProgressPlan4,
    },
    kpis: {
      totalDocs,
      totalPlan4,
      approvedDocs: docStatus.APPROVED.count,
      approvedPlan4: docStatus.APPROVED.plan4,
      approvedPct: formatSharePercent(docStatus.APPROVED.count, totalDocs),
      inProgressDocs: inProgressCount,
      inProgressPlan4,
      inProgressPct: formatSharePercent(inProgressCount, totalDocs),
      rejectedDocs: docStatus.REJECTED.count,
      rejectedPlan4: docStatus.REJECTED.plan4,
      rejectedPct: formatSharePercent(docStatus.REJECTED.count, totalDocs),
    },
    hasUnknownDocStatus: docStatus.OTHER.count > 0,
    hasUnknownRepaymentStatus: repayment.OTHER.count > 0,
    allMonthsReconciled: months.every((m) => m.reconciled),
  };
}

