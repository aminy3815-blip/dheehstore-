import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOwner } from '@/lib/auth';
import { db } from '@/lib/db';

const schema = z.object({
  destinationId: z.string().min(1),
  decision: z.enum(['VERIFIED', 'REJECTED']),
  verificationReference: z.string().trim().min(4).max(200),
});

export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return NextResponse.json({ error: 'Owner access required.' }, { status: 403 });
  try {
    const data = schema.parse(await req.json());
    await db.$transaction(async (tx) => {
      const destination = await tx.payoutDestination.findUniqueOrThrow({ where: { id: data.destinationId } });
      if (destination.status !== 'PENDING') throw new Error('Only pending destinations can be reviewed.');
      await tx.payoutDestination.update({ where: { id: destination.id }, data: { status: data.decision } });
      await tx.activityLog.create({
        data: {
          actorId: owner.id,
          action: 'payout-destination-review',
          entity: 'payout-destination',
          entityId: destination.id,
          details: `${destination.provider} destination ${data.decision.toLowerCase()}; review evidence: ${data.verificationReference}`,
        },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to review destination.' }, { status: 400 });
  }
}
