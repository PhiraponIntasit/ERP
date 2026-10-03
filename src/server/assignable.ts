import 'server-only';
import type { Prisma, User } from '@prisma/client';
import { db } from './db';

/** Who may be given repair work: an active IT Support account that still holds the
 *  "งานที่ได้รับมอบหมาย" permission (otherwise they couldn't open or update the job). */
export const ASSIGNABLE = { role: 'itsupport', active: true, perms: { has: 'tickets_work' } } satisfies Prisma.UserWhereInput;
export const canTakeWork = (u: Pick<User, 'role' | 'active' | 'perms'>) => u.role === 'itsupport' && u.active && u.perms.includes('tickets_work');

/** Statuses where the job is waiting on the technician. */
export const ACTIVE_WORK = ['assigned', 'progress', 'waiting'];

/** Jobs still sitting with someone who can no longer take work (suspended, or lost the permission). */
export const STRANDED: Prisma.TicketWhereInput = { status: { in: ACTIVE_WORK }, assignee: { NOT: ASSIGNABLE } };

export const activeWorkOf = (userId: string) => db.ticket.count({ where: { assigneeId: userId, status: { in: ACTIVE_WORK } } });
