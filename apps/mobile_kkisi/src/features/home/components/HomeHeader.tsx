import Image from 'next/image';
import { Icon } from '@/components/ui/Icon';
import { SheetTrigger, SheetClose } from '@/components/overlay/Sheet';
import { EmptyState } from '@/components/feedback/States';
import { getProfile } from '@/features/member/services/member.server';
import { getNotices } from '@/features/account/services/account.server';
import { dayLabel } from '@/lib/utils/dates';

export async function HomeHeader() {
  const [profile, notices] = await Promise.all([getProfile(), getNotices()]);
  const list = notices.state === 'ok' ? notices.data : [];
  const content = notices.state !== 'ok'
    ? <p className="detail-copy">Notifikasi belum dapat dimuat. Coba lagi nanti.</p>
    : list.length === 0
      ? <EmptyState icon="bell" title="Belum ada notifikasi" compact>Informasi dari koperasi akan tampil di sini.</EmptyState>
      : <ul className="list-card">{list.map((n) => (
        <li key={n.id} className="history-row"><div><strong>{n.title}</strong><small>{n.description}</small></div><small>{dayLabel(n.createdAt)}</small></li>
      ))}</ul>;
  return (
    <div className="app-header">
      <header className="topbar">
        <div className="identity">
          <div className="brand"><Image className="landscape-logo" src="/images/logo-landscape.png" width={640} height={222} alt="S-MART KKISI Tambun 2" priority /></div>
          <div className="greeting">Halo,<strong>{profile.firstName}</strong></div>
        </div>
        <h1 id="page-title" tabIndex={-1} className="sr-only">Beranda</h1>
        <SheetTrigger className="icon-btn" label={list.length ? `Notifikasi, ${list.length} informasi` : 'Notifikasi'} title="Notifikasi" subtitle="Informasi dari koperasi"
          content={<>{content}<SheetClose>Kembali ke beranda</SheetClose></>}>
          <Icon name="bell" />{list.length ? <span className="notification-dot" /> : null}
        </SheetTrigger>
      </header>
    </div>
  );
}
