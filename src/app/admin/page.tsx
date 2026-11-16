import { redirect } from 'next/navigation';
import { getOwner } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export default async function LegacyAdminRoute() { const owner = await getOwner(); if (owner) redirect('/owner'); redirect('/login?next=/owner'); }
