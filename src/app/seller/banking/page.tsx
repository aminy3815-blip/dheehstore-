import { getUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { BankingPanel } from '@/components/BankingPanel';

export const dynamic = 'force-dynamic';

export default async function SellerBankingPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.role !== 'PRODUCER' || !user.shop) redirect('/');
  return <main className="wrap pageContent">
    <div className="dashHead">
      <div><div className="eyebrow">SELLER STUDIO</div><h1>BANKING &amp; PAYMENTS</h1><p>{user.shop.name} · secure settlement details and history</p></div>
      <a className="textLink" href="/seller">Back to seller dashboard ↗</a>
    </div>
    <BankingPanel/>
  </main>;
}
