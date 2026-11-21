import crypto from 'crypto';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminAllowlist,
  adminRequests,
  attendance,
  certificates,
  courses,
  feedback,
  institutionCourses,
  institutionLocations,
  institutions,
  notifications,
  registrations,
  sessions,
  users,
  waitlist,
  workshops
} from './schema.ts';
import { OWNER_EMAIL } from './users.ts';

const STARTER_WORKSHOPS = [
  {
    name: 'Tailoring & Garment Making',
    category: 'Vocational & Trade',
    description: 'Learn measuring, pattern cutting and basic machine sewing.',
    duration: '6 Weeks',
    workshopDate: '2026-12-12',
    startTime: '09:00',
    capacity: 20,
    location: 'Metro Makers Lab',
    status: 'open'
  },
  {
    name: 'Computer Basics & Digital Skills',
    category: 'Digital Literacy',
    description:
      'Build confidence with computers, email, spreadsheets and online safety.',
    duration: '4 Weeks',
    workshopDate: '2026-12-15',
    startTime: '10:00',
    capacity: 24,
    location: 'City Library Tech Wing',
    status: 'open'
  },
  {
    name: 'First Aid Training',
    category: 'Healthcare & Safety',
    description:
      'Practice essential emergency response, CPR and injury care skills.',
    duration: '2 Days',
    workshopDate: '2026-12-18',
    startTime: '09:30',
    capacity: 18,
    location: 'Community Health Centre',
    status: 'open'
  },
  {
    name: 'Communication Skills',
    category: 'Soft Skills',
    description:
      'Improve public speaking, listening and workplace communication.',
    duration: '3 Weeks',
    workshopDate: '2026-12-20',
    startTime: '14:00',
    capacity: 30,
    location: 'Civic Learning Hall',
    status: 'open'
  }
];

function makeToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

function makeCheckinToken(): string {
  return `SC-REG-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
}

function extractCheckinToken(rawPayload: string): string {
  const trimmed = rawPayload.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { token?: unknown; checkinToken?: unknown };
      const val = parsed.checkinToken ?? parsed.token;
      if (typeof val === 'string') return val.trim().toUpperCase();
    } catch {
      // Fallback to raw parsing
    }
  }
  const match = trimmed.match(/SC-REG-[A-Z0-9]+/i);
  if (match) return match[0].toUpperCase();
  return trimmed.toUpperCase();
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function ensureCertificateTx(
  tx: DbTransaction,
  userUid: string,
  workshopId: number,
  workshopName?: string
) {
  const [existing] = await tx
    .select()
    .from(certificates)
    .where(
      and(
        eq(certificates.userUid, userUid),
        eq(certificates.workshopId, workshopId)
      )
    );

  if (existing) {
    return { certificate: existing, newlyIssued: false };
  }

  let resolvedName = workshopName;
  if (!resolvedName) {
    const [ws] = await tx
      .select({ name: workshops.name })
      .from(workshops)
      .where(eq(workshops.id, workshopId));
    resolvedName = ws?.name || 'SkillConnect Workshop';
  }

  const code = `SC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  const [created] = await tx
    .insert(certificates)
    .values({
      userUid,
      workshopId,
      certificateCode: code
    })
    .returning();

  await tx.insert(notifications).values({
    userUid,
    workshopId,
    type: 'certificate_issued',
    title: `Certificate Ready: ${resolvedName}`,
    message: `Your completion certificate (${code}) for ${resolvedName} has been automatically generated and is ready to download.`,
    isRead: false
  });

  return { certificate: created, newlyIssued: true };
}

async function promoteNextWaitlistedTx(tx: DbTransaction, workshopId: number) {
  const [workshop] = await tx
    .select()
    .from(workshops)
    .where(eq(workshops.id, workshopId));

  if (!workshop || workshop.status !== 'open') {
    return [];
  }

  const [{ total: confirmedTotal }] = await tx
    .select({ total: count() })
    .from(registrations)
    .where(
      and(
        eq(registrations.workshopId, workshopId),
        eq(registrations.status, 'confirmed')
      )
    );

  const [{ total: notifiedTotal }] = await tx
    .select({ total: count() })
    .from(waitlist)
    .where(
      and(
        eq(waitlist.workshopId, workshopId),
        eq(waitlist.status, 'notified')
      )
    );

  const openSlots = workshop.capacity - Number(confirmedTotal) - Number(notifiedTotal);
  if (openSlots <= 0) {
    return [];
  }

  const candidates = await tx
    .select()
    .from(waitlist)
    .where(
      and(
        eq(waitlist.workshopId, workshopId),
        eq(waitlist.status, 'waiting')
      )
    )
    .orderBy(asc(waitlist.createdAt), asc(waitlist.id))
    .limit(openSlots);

  const promoted = [];
  const now = new Date();
  for (const candidate of candidates) {
    const [updated] = await tx
      .update(waitlist)
      .set({
        status: 'notified',
        notifiedAt: now,
        updatedAt: now
      })
      .where(eq(waitlist.id, candidate.id))
      .returning();

    await tx.insert(notifications).values({
      userUid: candidate.userUid,
      workshopId,
      type: 'waitlist_seat',
      title: `Seat Available: ${workshop.name}`,
      message: `A seat just opened in ${workshop.name}. Confirm your seat on the Registration page to claim your spot.`,
      isRead: false
    });

    promoted.push(updated);
  }

  return promoted;
}

export async function ensureStarterWorkshops(): Promise<void> {
  try {
    const existing = await db.select({ id: workshops.id }).from(workshops).limit(1);
    if (existing.length > 0) return;

    await db.transaction(async (tx) => {
      const checkAgain = await tx.select({ id: workshops.id }).from(workshops).limit(1);
      if (checkAgain.length > 0) return;

      for (const item of STARTER_WORKSHOPS) {
        const [inserted] = await tx.insert(workshops).values(item).returning();
        await tx.insert(sessions).values({
          workshopId: inserted.id,
          sessionDate: item.workshopDate,
          startTime: item.startTime,
          qrToken: makeToken()
        });
      }
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to initialize starter workshops.', { cause: error });
  }
}

export async function listPublicWorkshops() {
  try {
    await ensureStarterWorkshops();
    const rows = await db
      .select()
      .from(workshops)
      .where(inArray(workshops.status, ['open', 'closed']))
      .orderBy(workshops.workshopDate);

    const counts = await db
      .select({
        workshopId: registrations.workshopId,
        total: count()
      })
      .from(registrations)
      .where(eq(registrations.status, 'confirmed'))
      .groupBy(registrations.workshopId);

    const waitlistCounts = await db
      .select({
        workshopId: waitlist.workshopId,
        total: count()
      })
      .from(waitlist)
      .where(inArray(waitlist.status, ['waiting', 'notified']))
      .groupBy(waitlist.workshopId);

    const countMap = new Map(counts.map((c) => [c.workshopId, Number(c.total)]));
    const waitMap = new Map(
      waitlistCounts.map((c) => [c.workshopId, Number(c.total)])
    );

    return rows.map((w) => ({
      ...w,
      registeredCount: countMap.get(w.id) ?? 0,
      waitlistCount: waitMap.get(w.id) ?? 0
    }));
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load workshops.', { cause: error });
  }
}

export async function listPublicFeedback() {
  try {
    const rows = await db
      .select({
        id: feedback.id,
        userUid: feedback.userUid,
        authorName: users.fullName,
        workshopId: feedback.workshopId,
        workshopName: workshops.name,
        rating: feedback.rating,
        comments: feedback.comments,
        createdAt: feedback.createdAt
      })
      .from(feedback)
      .innerJoin(users, eq(feedback.userUid, users.uid))
      .innerJoin(workshops, eq(feedback.workshopId, workshops.id))
      .orderBy(desc(feedback.createdAt));

    return rows.map((r) => ({
      ...r,
      authorName: r.authorName || 'Community Member'
    }));
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load feedback.', { cause: error });
  }
}

export async function getUserProfileAndActivity(uid: string) {
  try {
    const [profile] = await db.select().from(users).where(eq(users.uid, uid));

    const myRegsRaw = await db
      .select({
        id: registrations.id,
        workshopId: registrations.workshopId,
        workshopName: workshops.name,
        status: registrations.status,
        checkinToken: registrations.checkinToken,
        registeredAt: registrations.registeredAt
      })
      .from(registrations)
      .innerJoin(workshops, eq(registrations.workshopId, workshops.id))
      .where(eq(registrations.userUid, uid))
      .orderBy(desc(registrations.registeredAt));

    const myRegs = [];
    for (const reg of myRegsRaw) {
      let token = reg.checkinToken;
      if (!token && reg.status === 'confirmed') {
        token = makeCheckinToken();
        await db
          .update(registrations)
          .set({ checkinToken: token })
          .where(eq(registrations.id, reg.id));
      }
      myRegs.push({ ...reg, checkinToken: token });
    }

    const myCerts = await db
      .select({
        id: certificates.id,
        workshopId: certificates.workshopId,
        workshopName: workshops.name,
        certificateCode: certificates.certificateCode,
        issuedAt: certificates.issuedAt
      })
      .from(certificates)
      .innerJoin(workshops, eq(certificates.workshopId, workshops.id))
      .where(eq(certificates.userUid, uid))
      .orderBy(desc(certificates.issuedAt));

    const myWaitlistRows = await db
      .select({
        id: waitlist.id,
        workshopId: waitlist.workshopId,
        workshopName: workshops.name,
        status: waitlist.status,
        notifiedAt: waitlist.notifiedAt,
        createdAt: waitlist.createdAt
      })
      .from(waitlist)
      .innerJoin(workshops, eq(waitlist.workshopId, workshops.id))
      .where(eq(waitlist.userUid, uid))
      .orderBy(desc(waitlist.createdAt));

    const activeQueueRows = myWaitlistRows.some((w) =>
      ['waiting', 'notified'].includes(w.status)
    )
      ? await db
          .select({
            id: waitlist.id,
            workshopId: waitlist.workshopId
          })
          .from(waitlist)
          .where(inArray(waitlist.status, ['waiting', 'notified']))
          .orderBy(asc(waitlist.createdAt), asc(waitlist.id))
      : [];

    const myWaitlist = myWaitlistRows.map((entry) => {
      if (!['waiting', 'notified'].includes(entry.status)) {
        return { ...entry, position: null };
      }
      const sameWorkshop = activeQueueRows.filter(
        (q) => q.workshopId === entry.workshopId
      );
      const idx = sameWorkshop.findIndex((q) => q.id === entry.id);
      return { ...entry, position: idx >= 0 ? idx + 1 : null };
    });

    const myNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userUid, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(25);

    return {
      profile: profile || null,
      registrations: myRegs,
      certificates: myCerts,
      waitlist: myWaitlist,
      notifications: myNotifications
    };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load account profile.', { cause: error });
  }
}

export async function registerParticipantForWorkshop(params: {
  uid: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  address: string;
  workshopId: number;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [workshop] = await tx
        .select()
        .from(workshops)
        .where(eq(workshops.id, params.workshopId));

      if (!workshop || workshop.status !== 'open') {
        return { error: 'This workshop is closed or unavailable.', status: 400 };
      }

      const [existingReg] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.userUid, params.uid),
            eq(registrations.workshopId, params.workshopId)
          )
        );

      if (existingReg && existingReg.status === 'confirmed') {
        return {
          error: 'You are already registered for this workshop.',
          status: 409
        };
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(registrations)
        .where(
          and(
            eq(registrations.workshopId, params.workshopId),
            eq(registrations.status, 'confirmed')
          )
        );

      if (Number(total) >= workshop.capacity) {
        return {
          error: 'This workshop is full. Please join the waiting list instead.',
          status: 400
        };
      }

      await tx
        .update(users)
        .set({
          fullName: params.fullName,
          age: params.age,
          gender: params.gender,
          phone: params.phone,
          email: params.email,
          address: params.address,
          updatedAt: new Date()
        })
        .where(eq(users.uid, params.uid));

      let registration;
      if (existingReg) {
        const [updated] = await tx
          .update(registrations)
          .set({
            status: 'confirmed',
            checkinToken: existingReg.checkinToken || makeCheckinToken(),
            registeredAt: new Date()
          })
          .where(eq(registrations.id, existingReg.id))
          .returning();
        registration = updated;
      } else {
        const [inserted] = await tx
          .insert(registrations)
          .values({
            userUid: params.uid,
            workshopId: params.workshopId,
            status: 'confirmed',
            checkinToken: makeCheckinToken()
          })
          .returning();
        registration = inserted;
      }

      await tx
        .update(waitlist)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(
          and(
            eq(waitlist.userUid, params.uid),
            eq(waitlist.workshopId, params.workshopId),
            inArray(waitlist.status, ['waiting', 'notified'])
          )
        );

      return { registration, workshopName: workshop.name, status: 201 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to complete registration.', { cause: error });
  }
}

export async function joinWorkshopWaitlist(params: {
  uid: string;
  fullName: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  address: string;
  workshopId: number;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [workshop] = await tx
        .select()
        .from(workshops)
        .where(eq(workshops.id, params.workshopId));

      if (!workshop || workshop.status !== 'open') {
        return { error: 'This workshop is closed or unavailable.', status: 400 };
      }

      const [existingReg] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.userUid, params.uid),
            eq(registrations.workshopId, params.workshopId),
            eq(registrations.status, 'confirmed')
          )
        );

      if (existingReg) {
        return {
          error: 'You are already registered for this workshop.',
          status: 409
        };
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(registrations)
        .where(
          and(
            eq(registrations.workshopId, params.workshopId),
            eq(registrations.status, 'confirmed')
          )
        );

      if (Number(total) < workshop.capacity) {
        return {
          error: 'Seats are currently available! Please confirm a standard registration instead.',
          status: 400
        };
      }

      const [existingWait] = await tx
        .select()
        .from(waitlist)
        .where(
          and(
            eq(waitlist.userUid, params.uid),
            eq(waitlist.workshopId, params.workshopId)
          )
        );

      if (existingWait && ['waiting', 'notified'].includes(existingWait.status)) {
        return {
          error: 'You are already on the waiting list for this workshop.',
          status: 409
        };
      }

      await tx
        .update(users)
        .set({
          fullName: params.fullName,
          age: params.age,
          gender: params.gender,
          phone: params.phone,
          email: params.email,
          address: params.address,
          updatedAt: new Date()
        })
        .where(eq(users.uid, params.uid));

      const now = new Date();
      let entry;
      if (existingWait) {
        const [updated] = await tx
          .update(waitlist)
          .set({
            fullName: params.fullName,
            age: params.age,
            gender: params.gender,
            phone: params.phone,
            email: params.email,
            address: params.address,
            status: 'waiting',
            notifiedAt: null,
            createdAt: now,
            updatedAt: now
          })
          .where(eq(waitlist.id, existingWait.id))
          .returning();
        entry = updated;
      } else {
        const [inserted] = await tx
          .insert(waitlist)
          .values({
            userUid: params.uid,
            workshopId: params.workshopId,
            fullName: params.fullName,
            age: params.age,
            gender: params.gender,
            phone: params.phone,
            email: params.email,
            address: params.address,
            status: 'waiting',
            createdAt: now,
            updatedAt: now
          })
          .returning();
        entry = inserted;
      }

      const queue = await tx
        .select({ id: waitlist.id })
        .from(waitlist)
        .where(
          and(
            eq(waitlist.workshopId, params.workshopId),
            inArray(waitlist.status, ['waiting', 'notified'])
          )
        )
        .orderBy(asc(waitlist.createdAt), asc(waitlist.id));

      const position = queue.findIndex((q) => q.id === entry.id) + 1;
      return {
        waitlistEntry: entry,
        position: position > 0 ? position : queue.length,
        workshopName: workshop.name,
        status: 201
      };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to join waiting list.', { cause: error });
  }
}

export async function confirmWaitlistSeat(uid: string, waitlistId: number) {
  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(waitlist)
        .where(and(eq(waitlist.id, waitlistId), eq(waitlist.userUid, uid)));

      if (!entry) {
        return { error: 'Waitlist entry not found.', status: 404 };
      }

      if (!['notified', 'waiting'].includes(entry.status)) {
        return { error: 'This waitlist offer is no longer active.', status: 400 };
      }

      const [workshop] = await tx
        .select()
        .from(workshops)
        .where(eq(workshops.id, entry.workshopId));

      if (!workshop || workshop.status !== 'open') {
        return { error: 'This workshop is closed or unavailable.', status: 400 };
      }

      const [{ total }] = await tx
        .select({ total: count() })
        .from(registrations)
        .where(
          and(
            eq(registrations.workshopId, entry.workshopId),
            eq(registrations.status, 'confirmed')
          )
        );

      if (Number(total) >= workshop.capacity) {
        return {
          error: 'No seats are currently open. You remain on the waiting list.',
          status: 409
        };
      }

      const [existingReg] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.userUid, uid),
            eq(registrations.workshopId, entry.workshopId)
          )
        );

      let registration;
      if (existingReg) {
        const [updated] = await tx
          .update(registrations)
          .set({
            status: 'confirmed',
            checkinToken: existingReg.checkinToken || makeCheckinToken(),
            registeredAt: new Date()
          })
          .where(eq(registrations.id, existingReg.id))
          .returning();
        registration = updated;
      } else {
        const [inserted] = await tx
          .insert(registrations)
          .values({
            userUid: uid,
            workshopId: entry.workshopId,
            status: 'confirmed',
            checkinToken: makeCheckinToken()
          })
          .returning();
        registration = inserted;
      }

      await tx
        .update(waitlist)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(eq(waitlist.id, entry.id));

      await tx
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userUid, uid),
            eq(notifications.workshopId, entry.workshopId),
            eq(notifications.type, 'waitlist_seat')
          )
        );

      return { registration, workshopName: workshop.name, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to confirm waitlist seat.', { cause: error });
  }
}

export async function declineWaitlistEntry(
  waitlistId: number,
  actorUid: string,
  isAdmin: boolean
) {
  try {
    return await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(waitlist)
        .where(eq(waitlist.id, waitlistId));

      if (!entry) {
        return { error: 'Waitlist entry not found.', status: 404 };
      }

      if (!isAdmin && entry.userUid !== actorUid) {
        return { error: 'Forbidden', status: 403 };
      }

      const wasNotified = entry.status === 'notified';
      await tx
        .update(waitlist)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(waitlist.id, waitlistId));

      await tx
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.userUid, entry.userUid),
            eq(notifications.workshopId, entry.workshopId),
            eq(notifications.type, 'waitlist_seat')
          )
        );

      let promoted: Array<typeof waitlist.$inferSelect> = [];
      if (wasNotified) {
        promoted = await promoteNextWaitlistedTx(tx, entry.workshopId);
      }

      return { cancelled: waitlistId, promotedCount: promoted.length, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to update waitlist entry.', { cause: error });
  }
}

export async function cancelRegistrationById(
  registrationId: number,
  actorUid: string,
  isAdmin: boolean
) {
  try {
    return await db.transaction(async (tx) => {
      const [reg] = await tx
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));

      if (!reg) {
        return { error: 'Registration not found.', status: 404 };
      }

      if (!isAdmin && reg.userUid !== actorUid) {
        return { error: 'Forbidden', status: 403 };
      }

      if (reg.status === 'cancelled') {
        return { error: 'Registration is already cancelled.', status: 400 };
      }

      await tx
        .update(registrations)
        .set({ status: 'cancelled' })
        .where(eq(registrations.id, registrationId));

      const promoted = await promoteNextWaitlistedTx(tx, reg.workshopId);
      return {
        cancelledId: registrationId,
        promotedWaitlist: promoted.map((p) => ({
          id: p.id,
          email: p.email,
          fullName: p.fullName
        })),
        status: 200
      };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to cancel registration.', { cause: error });
  }
}

export async function markNotificationsRead(uid: string, notificationId?: number) {
  try {
    if (notificationId) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(
            eq(notifications.id, notificationId),
            eq(notifications.userUid, uid)
          )
        );
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.userUid, uid));
    }
    return { ok: true };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to update notifications.', { cause: error });
  }
}

export async function upsertFeedback(params: {
  uid: string;
  workshopId: number;
  rating: number;
  comments: string;
}) {
  try {
    const [workshop] = await db
      .select()
      .from(workshops)
      .where(eq(workshops.id, params.workshopId));

    if (!workshop) {
      return { error: 'Selected workshop not found.', status: 404 };
    }

    const [row] = await db
      .insert(feedback)
      .values({
        userUid: params.uid,
        workshopId: params.workshopId,
        rating: params.rating,
        comments: params.comments
      })
      .onConflictDoUpdate({
        target: [feedback.userUid, feedback.workshopId],
        set: {
          rating: params.rating,
          comments: params.comments,
          createdAt: new Date()
        }
      })
      .returning();

    return { feedback: row, status: 200 };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to save feedback.', { cause: error });
  }
}

export async function lookupQrSession(qrToken: string) {
  try {
    const [row] = await db
      .select({
        sessionId: sessions.id,
        workshopId: workshops.id,
        workshopName: workshops.name,
        sessionDate: sessions.sessionDate,
        startTime: sessions.startTime
      })
      .from(sessions)
      .innerJoin(workshops, eq(sessions.workshopId, workshops.id))
      .where(eq(sessions.qrToken, qrToken));

    return row || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to look up QR session.', { cause: error });
  }
}

export async function markQrAttendance(uid: string, qrToken: string) {
  try {
    const session = await lookupQrSession(qrToken);
    if (!session) {
      return { status: 404, code: 'invalid', message: 'Invalid QR code.' };
    }

    return await db.transaction(async (tx) => {
      const [reg] = await tx
        .select()
        .from(registrations)
        .where(
          and(
            eq(registrations.userUid, uid),
            eq(registrations.workshopId, session.workshopId),
            eq(registrations.status, 'confirmed')
          )
        );

      if (!reg) {
        return {
          status: 403,
          code: 'not-registered',
          workshopId: session.workshopId,
          workshopName: session.workshopName,
          message: 'No matching workshop registration was found.'
        };
      }

      const [existingAtt] = await tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.registrationId, reg.id),
            eq(attendance.sessionId, session.sessionId)
          )
        );

      if (existingAtt && existingAtt.status === 'present') {
        const certResult = await ensureCertificateTx(
          tx,
          uid,
          session.workshopId,
          session.workshopName
        );
        return {
          status: 200,
          code: 'marked',
          duplicate: true,
          workshopName: session.workshopName,
          certificateCode: certResult.certificate.certificateCode
        };
      }

      await tx
        .insert(attendance)
        .values({
          registrationId: reg.id,
          sessionId: session.sessionId,
          status: 'present'
        })
        .onConflictDoUpdate({
          target: [attendance.registrationId, attendance.sessionId],
          set: {
            status: 'present',
            markedAt: new Date()
          }
        });

      const certResult = await ensureCertificateTx(
        tx,
        uid,
        session.workshopId,
        session.workshopName
      );

      return {
        status: 200,
        code: 'marked',
        duplicate: false,
        workshopName: session.workshopName,
        certificateCode: certResult.certificate.certificateCode
      };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to record QR attendance.', { cause: error });
  }
}

export async function scanParticipantQrAttendance(
  rawPayload: string,
  expectedSessionId?: number
) {
  const token = extractCheckinToken(rawPayload);
  if (!token) {
    return { status: 400, error: 'Please scan or enter a valid participant QR code.' };
  }

  try {
    return await db.transaction(async (tx) => {
      const [regRow] = await tx
        .select({
          id: registrations.id,
          userUid: registrations.userUid,
          workshopId: registrations.workshopId,
          status: registrations.status,
          checkinToken: registrations.checkinToken,
          participantName: users.fullName,
          email: users.email,
          workshopName: workshops.name
        })
        .from(registrations)
        .innerJoin(users, eq(registrations.userUid, users.uid))
        .innerJoin(workshops, eq(registrations.workshopId, workshops.id))
        .where(eq(registrations.checkinToken, token));

      if (!regRow) {
        return {
          status: 404,
          error: 'No registered participant matches this QR code.'
        };
      }

      if (regRow.status !== 'confirmed') {
        return {
          status: 400,
          error: `Registration for ${regRow.participantName || regRow.email} is ${regRow.status}.`
        };
      }

      let targetSession;
      if (expectedSessionId) {
        const [sess] = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.id, expectedSessionId));
        if (!sess) {
          return { status: 404, error: 'Selected workshop session not found.' };
        }
        if (sess.workshopId !== regRow.workshopId) {
          return {
            status: 400,
            error: `This QR pass belongs to "${regRow.workshopName}", not the currently selected session.`
          };
        }
        targetSession = sess;
      } else {
        const [sess] = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.workshopId, regRow.workshopId))
          .orderBy(desc(sessions.sessionDate))
          .limit(1);
        targetSession = sess;
      }

      if (!targetSession) {
        return {
          status: 404,
          error: `No active session found for ${regRow.workshopName}.`
        };
      }

      const displayName = regRow.participantName || regRow.email;

      const [existingAtt] = await tx
        .select()
        .from(attendance)
        .where(
          and(
            eq(attendance.registrationId, regRow.id),
            eq(attendance.sessionId, targetSession.id)
          )
        );

      if (existingAtt && existingAtt.status === 'present') {
        const certRes = await ensureCertificateTx(
          tx,
          regRow.userUid,
          regRow.workshopId,
          regRow.workshopName
        );
        return {
          status: 409,
          duplicate: true,
          participantName: displayName,
          email: regRow.email,
          workshopName: regRow.workshopName,
          sessionDate: targetSession.sessionDate,
          markedAt: existingAtt.markedAt,
          certificate: certRes.certificate,
          error: `Duplicate prevented: ${displayName} was already marked present for ${regRow.workshopName}.`
        };
      }

      const now = new Date();
      await tx
        .insert(attendance)
        .values({
          registrationId: regRow.id,
          sessionId: targetSession.id,
          status: 'present',
          markedAt: now
        })
        .onConflictDoUpdate({
          target: [attendance.registrationId, attendance.sessionId],
          set: {
            status: 'present',
            markedAt: now
          }
        });

      const certRes = await ensureCertificateTx(
        tx,
        regRow.userUid,
        regRow.workshopId,
        regRow.workshopName
      );

      return {
        status: 200,
        duplicate: false,
        participantName: displayName,
        email: regRow.email,
        workshopName: regRow.workshopName,
        sessionDate: targetSession.sessionDate,
        markedAt: now,
        certificate: certRes.certificate,
        newlyIssued: certRes.newlyIssued
      };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to process QR attendance scan.', { cause: error });
  }
}

export async function getCertificateByCode(code: string) {
  try {
    const [row] = await db
      .select({
        id: certificates.id,
        certificateCode: certificates.certificateCode,
        issuedAt: certificates.issuedAt,
        participantName: users.fullName,
        participantEmail: users.email,
        workshopName: workshops.name
      })
      .from(certificates)
      .innerJoin(users, eq(certificates.userUid, users.uid))
      .innerJoin(workshops, eq(certificates.workshopId, workshops.id))
      .where(eq(certificates.certificateCode, code));

    if (!row) return null;
    return {
      id: row.id,
      certificateCode: row.certificateCode,
      issuedAt: row.issuedAt,
      participantName: row.participantName || row.participantEmail,
      workshopName: row.workshopName
    };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to look up certificate.', { cause: error });
  }
}

export async function getAdminOverview() {
  try {
    await ensureStarterWorkshops();

    const allWorkshops = await db
      .select()
      .from(workshops)
      .orderBy(desc(workshops.workshopDate));

    const allSessions = await db
      .select({
        id: sessions.id,
        workshopId: sessions.workshopId,
        workshopName: workshops.name,
        sessionDate: sessions.sessionDate,
        startTime: sessions.startTime,
        qrToken: sessions.qrToken
      })
      .from(sessions)
      .innerJoin(workshops, eq(sessions.workshopId, workshops.id))
      .orderBy(desc(sessions.sessionDate));

    const allRegs = await db
      .select({
        id: registrations.id,
        userUid: registrations.userUid,
        participantName: users.fullName,
        email: users.email,
        workshopId: registrations.workshopId,
        workshopName: workshops.name,
        status: registrations.status,
        checkinToken: registrations.checkinToken,
        registeredAt: registrations.registeredAt
      })
      .from(registrations)
      .innerJoin(users, eq(registrations.userUid, users.uid))
      .innerJoin(workshops, eq(registrations.workshopId, workshops.id))
      .orderBy(desc(registrations.registeredAt));

    const allAttendance = await db.select().from(attendance);

    const allCerts = await db
      .select({
        id: certificates.id,
        userUid: certificates.userUid,
        participantName: users.fullName,
        email: users.email,
        workshopId: certificates.workshopId,
        workshopName: workshops.name,
        certificateCode: certificates.certificateCode,
        issuedAt: certificates.issuedAt
      })
      .from(certificates)
      .innerJoin(users, eq(certificates.userUid, users.uid))
      .innerJoin(workshops, eq(certificates.workshopId, workshops.id))
      .orderBy(desc(certificates.issuedAt));

    const allWaitlist = await db
      .select({
        id: waitlist.id,
        userUid: waitlist.userUid,
        workshopId: waitlist.workshopId,
        workshopName: workshops.name,
        fullName: waitlist.fullName,
        email: waitlist.email,
        phone: waitlist.phone,
        status: waitlist.status,
        notifiedAt: waitlist.notifiedAt,
        createdAt: waitlist.createdAt
      })
      .from(waitlist)
      .innerJoin(workshops, eq(waitlist.workshopId, workshops.id))
      .orderBy(asc(waitlist.createdAt), asc(waitlist.id));

    const confirmedRegs = allRegs.filter((r) => r.status === 'confirmed');
    const regById = new Map(allRegs.map((r) => [r.id, r]));

    const regCountByWorkshop = new Map<number, number>();
    for (const r of confirmedRegs) {
      regCountByWorkshop.set(
        r.workshopId,
        (regCountByWorkshop.get(r.workshopId) ?? 0) + 1
      );
    }

    const waitCountByWorkshop = new Map<number, number>();
    for (const w of allWaitlist) {
      if (['waiting', 'notified'].includes(w.status)) {
        waitCountByWorkshop.set(
          w.workshopId,
          (waitCountByWorkshop.get(w.workshopId) ?? 0) + 1
        );
      }
    }

    const presentByWorkshop = new Map<number, number>();
    const absentByWorkshop = new Map<number, number>();
    for (const a of allAttendance) {
      const reg = regById.get(a.registrationId);
      if (!reg) continue;
      if (a.status === 'present') {
        presentByWorkshop.set(
          reg.workshopId,
          (presentByWorkshop.get(reg.workshopId) ?? 0) + 1
        );
      } else if (a.status === 'absent') {
        absentByWorkshop.set(
          reg.workshopId,
          (absentByWorkshop.get(reg.workshopId) ?? 0) + 1
        );
      }
    }

    const certCountByWorkshop = new Map<number, number>();
    for (const c of allCerts) {
      certCountByWorkshop.set(
        c.workshopId,
        (certCountByWorkshop.get(c.workshopId) ?? 0) + 1
      );
    }

    const popularWorkshops = allWorkshops
      .map((w) => {
        const regCount = regCountByWorkshop.get(w.id) ?? 0;
        const waitCount = waitCountByWorkshop.get(w.id) ?? 0;
        const pCount = presentByWorkshop.get(w.id) ?? 0;
        const aCount = absentByWorkshop.get(w.id) ?? 0;
        const cCount = certCountByWorkshop.get(w.id) ?? 0;
        const fillRate = w.capacity > 0 ? Math.round((regCount / w.capacity) * 100) : 0;
        const completionRate =
          regCount > 0 ? Math.min(100, Math.round((cCount / regCount) * 100)) : 0;

        return {
          id: w.id,
          name: w.name,
          category: w.category,
          status: w.status,
          workshopDate: w.workshopDate,
          capacity: w.capacity,
          registeredCount: regCount,
          waitlistCount: waitCount,
          fillRate,
          presentCount: pCount,
          absentCount: aCount,
          certifiedCount: cCount,
          completionRate
        };
      })
      .sort(
        (a, b) =>
          b.registeredCount + b.waitlistCount - (a.registeredCount + a.waitlistCount)
      );

    const categoryMap = new Map<
      string,
      { category: string; workshops: number; registrations: number; certified: number }
    >();
    for (const w of popularWorkshops) {
      const existing = categoryMap.get(w.category) || {
        category: w.category,
        workshops: 0,
        registrations: 0,
        certified: 0
      };
      existing.workshops += 1;
      existing.registrations += w.registeredCount;
      existing.certified += w.certifiedCount;
      categoryMap.set(w.category, existing);
    }

    const presentTotal = allAttendance.filter((a) => a.status === 'present').length;
    const absentTotal = allAttendance.filter((a) => a.status === 'absent').length;
    const markedTotal = presentTotal + absentTotal;

    return {
      workshops: allWorkshops.map((w) => ({
        ...w,
        registeredCount: regCountByWorkshop.get(w.id) ?? 0,
        waitlistCount: waitCountByWorkshop.get(w.id) ?? 0
      })),
      sessions: allSessions,
      registrations: allRegs.map((r) => ({
        ...r,
        participantName: r.participantName || r.email
      })),
      attendance: allAttendance,
      certificates: allCerts.map((c) => ({
        ...c,
        participantName: c.participantName || c.email
      })),
      waitlist: allWaitlist,
      analytics: {
        totalParticipants: new Set(confirmedRegs.map((r) => r.userUid)).size,
        totalWorkshops: allWorkshops.length,
        totalRegistrations: confirmedRegs.length,
        totalWaitlisted: allWaitlist.filter((w) =>
          ['waiting', 'notified'].includes(w.status)
        ).length,
        presentCount: presentTotal,
        absentCount: absentTotal,
        attendanceRate: markedTotal
          ? Math.round((presentTotal / markedTotal) * 100)
          : 0,
        totalCertificates: allCerts.length,
        popularWorkshops,
        categoryStats: Array.from(categoryMap.values()).sort(
          (a, b) => b.registrations - a.registrations
        )
      }
    };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load admin dashboard data.', { cause: error });
  }
}

export async function createWorkshopWithSession(params: {
  name: string;
  category: string;
  description: string;
  duration: string;
  workshopDate: string;
  startTime: string;
  capacity: number;
  location: string;
}) {
  try {
    return await db.transaction(async (tx) => {
      const [workshop] = await tx
        .insert(workshops)
        .values({
          name: params.name,
          category: params.category,
          description: params.description,
          duration: params.duration,
          workshopDate: params.workshopDate,
          startTime: params.startTime,
          capacity: params.capacity,
          location: params.location,
          status: 'open'
        })
        .returning();

      const [session] = await tx
        .insert(sessions)
        .values({
          workshopId: workshop.id,
          sessionDate: params.workshopDate,
          startTime: params.startTime,
          qrToken: makeToken()
        })
        .returning();

      return { workshop, session };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to create workshop.', { cause: error });
  }
}

export async function updateWorkshopDetails(
  id: number,
  updates: { status?: string; capacity?: number }
) {
  try {
    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(workshops)
        .where(eq(workshops.id, id));
      if (!existing) return null;

      const nextValues: { status?: string; capacity?: number } = {};
      if (updates.status !== undefined) nextValues.status = updates.status;
      if (updates.capacity !== undefined) nextValues.capacity = updates.capacity;

      const [updated] = await tx
        .update(workshops)
        .set(nextValues)
        .where(eq(workshops.id, id))
        .returning();

      const promoted = await promoteNextWaitlistedTx(tx, id);
      return { workshop: updated, promotedCount: promoted.length };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to update workshop.', { cause: error });
  }
}

export async function adminNotifyNextWaitlist(workshopId: number) {
  try {
    return await db.transaction(async (tx) => {
      const promoted = await promoteNextWaitlistedTx(tx, workshopId);
      return { promotedCount: promoted.length, promoted };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to notify next waitlisted participant.', {
      cause: error
    });
  }
}

export async function saveSessionAttendance(
  sessionId: number,
  entries: Array<{ registrationId: number; status: 'present' | 'absent' }>
) {
  try {
    return await db.transaction(async (tx) => {
      const [sess] = await tx
        .select({
          id: sessions.id,
          workshopId: sessions.workshopId,
          workshopName: workshops.name
        })
        .from(sessions)
        .innerJoin(workshops, eq(sessions.workshopId, workshops.id))
        .where(eq(sessions.id, sessionId));

      let newlyCertified = 0;

      for (const entry of entries) {
        const [existing] = await tx
          .select()
          .from(attendance)
          .where(
            and(
              eq(attendance.registrationId, entry.registrationId),
              eq(attendance.sessionId, sessionId)
            )
          );

        if (!existing) {
          await tx.insert(attendance).values({
            registrationId: entry.registrationId,
            sessionId,
            status: entry.status
          });
        } else if (existing.status !== entry.status) {
          await tx
            .update(attendance)
            .set({ status: entry.status, markedAt: new Date() })
            .where(eq(attendance.id, existing.id));
        }

        if (entry.status === 'present' && sess) {
          const [reg] = await tx
            .select()
            .from(registrations)
            .where(eq(registrations.id, entry.registrationId));

          if (reg) {
            const res = await ensureCertificateTx(
              tx,
              reg.userUid,
              sess.workshopId,
              sess.workshopName
            );
            if (res.newlyIssued) newlyCertified += 1;
          }
        }
      }

      return { saved: entries.length, newlyCertified };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to save attendance.', { cause: error });
  }
}

export async function issueCertificateForRegistration(registrationId: number) {
  try {
    return await db.transaction(async (tx) => {
      const [reg] = await tx
        .select()
        .from(registrations)
        .where(eq(registrations.id, registrationId));

      if (!reg) {
        return { error: 'Registration not found.', status: 404 };
      }

      const presentRows = await tx
        .select({ id: attendance.id })
        .from(attendance)
        .where(
          and(
            eq(attendance.registrationId, reg.id),
            eq(attendance.status, 'present')
          )
        )
        .limit(1);

      if (presentRows.length === 0) {
        return {
          error:
            'Not eligible: No present attendance was found for this participant and workshop.',
          status: 400
        };
      }

      const [existing] = await tx
        .select()
        .from(certificates)
        .where(
          and(
            eq(certificates.userUid, reg.userUid),
            eq(certificates.workshopId, reg.workshopId)
          )
        );

      if (existing) {
        return {
          error: `Certificate already issued (${existing.certificateCode}).`,
          status: 409
        };
      }

      const res = await ensureCertificateTx(tx, reg.userUid, reg.workshopId);
      return { certificate: res.certificate, status: 201 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to issue certificate.', { cause: error });
  }
}

export async function getMyAdminRequest(email: string) {
  const normalized = email.trim().toLowerCase();
  try {
    const [row] = await db
      .select()
      .from(adminRequests)
      .where(eq(adminRequests.email, normalized));
    return row || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load admin access request.', { cause: error });
  }
}

export async function submitAdminRequest(params: {
  uid: string;
  email: string;
  fullName?: string | null;
  reason: string;
}) {
  const normalized = params.email.trim().toLowerCase();
  if (normalized === OWNER_EMAIL) {
    return { error: 'Owner account already has full administrator authority.', status: 400 };
  }

  try {
    const [existingAllowed] = await db
      .select({ id: adminAllowlist.id })
      .from(adminAllowlist)
      .where(eq(adminAllowlist.email, normalized));
    if (existingAllowed) {
      return { error: 'Your email already has administrator access.', status: 400 };
    }

    const now = new Date();
    const [requestRow] = await db
      .insert(adminRequests)
      .values({
        userUid: params.uid,
        email: normalized,
        fullName: params.fullName || null,
        reason: params.reason,
        status: 'pending',
        reviewedByEmail: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: adminRequests.email,
        set: {
          userUid: params.uid,
          fullName: params.fullName || null,
          reason: params.reason,
          status: 'pending',
          reviewedByEmail: null,
          reviewedAt: null,
          updatedAt: now
        }
      })
      .returning();

    return { request: requestRow, status: 201 };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to submit admin access request.', { cause: error });
  }
}

export async function listAuthorizedAdmins() {
  try {
    const allowlisted = await db
      .select()
      .from(adminAllowlist)
      .orderBy(desc(adminAllowlist.createdAt));

    const requests = await db
      .select()
      .from(adminRequests)
      .orderBy(desc(adminRequests.updatedAt));

    requests.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    const allUsers = await db.select().from(users);
    const userByEmail = new Map(
      allUsers.map((u) => [u.email.toLowerCase(), u])
    );

    const ownerUser = userByEmail.get(OWNER_EMAIL);
    const delegated = allowlisted.map((row) => {
      const matched = userByEmail.get(row.email.toLowerCase());
      return {
        id: row.id,
        email: row.email,
        invitedByEmail: row.invitedByEmail,
        createdAt: row.createdAt,
        hasSignedIn: Boolean(matched),
        fullName: matched?.fullName || null,
        isOwner: false
      };
    });

    return {
      owner: {
        email: OWNER_EMAIL,
        fullName: ownerUser?.fullName || 'Platform Owner',
        hasSignedIn: Boolean(ownerUser),
        isOwner: true
      },
      admins: delegated,
      requests
    };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load authorized administrators.', { cause: error });
  }
}

export async function grantAdminAccess(targetEmail: string, ownerEmail: string) {
  const normalized = targetEmail.trim().toLowerCase();
  if (normalized === OWNER_EMAIL) {
    return { error: 'Owner account already has full administrator authority.', status: 400 };
  }

  try {
    return await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(adminAllowlist)
        .values({
          email: normalized,
          invitedByEmail: ownerEmail.trim().toLowerCase()
        })
        .onConflictDoNothing({ target: adminAllowlist.email })
        .returning();

      if (!inserted) {
        return { error: 'This email is already authorized as an administrator.', status: 409 };
      }

      const now = new Date();
      await tx
        .update(users)
        .set({ role: 'admin', updatedAt: now })
        .where(eq(users.email, normalized));

      await tx
        .update(adminRequests)
        .set({
          status: 'approved',
          reviewedByEmail: ownerEmail.trim().toLowerCase(),
          reviewedAt: now,
          updatedAt: now
        })
        .where(eq(adminRequests.email, normalized));

      return { admin: inserted, status: 201 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to grant administrator access.', { cause: error });
  }
}

export async function approveAdminRequest(targetEmail: string, ownerEmail: string) {
  const normalized = targetEmail.trim().toLowerCase();
  const normalizedOwner = ownerEmail.trim().toLowerCase();
  if (normalized === OWNER_EMAIL) {
    return { error: 'Owner account already has full administrator authority.', status: 400 };
  }

  try {
    return await db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(adminRequests)
        .where(eq(adminRequests.email, normalized));

      if (!reqRow) {
        return { error: 'Admin access request not found.', status: 404 };
      }

      const now = new Date();
      await tx
        .insert(adminAllowlist)
        .values({
          email: normalized,
          invitedByEmail: normalizedOwner
        })
        .onConflictDoNothing({ target: adminAllowlist.email });

      await tx
        .update(users)
        .set({ role: 'admin', updatedAt: now })
        .where(eq(users.email, normalized));

      const [updatedReq] = await tx
        .update(adminRequests)
        .set({
          status: 'approved',
          reviewedByEmail: normalizedOwner,
          reviewedAt: now,
          updatedAt: now
        })
        .where(eq(adminRequests.email, normalized))
        .returning();

      return { request: updatedReq, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to approve administrator request.', { cause: error });
  }
}

export async function rejectAdminRequest(targetEmail: string, ownerEmail: string) {
  const normalized = targetEmail.trim().toLowerCase();
  const normalizedOwner = ownerEmail.trim().toLowerCase();
  if (normalized === OWNER_EMAIL) {
    return { error: 'Cannot reject owner administrator privileges.', status: 400 };
  }

  try {
    return await db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select()
        .from(adminRequests)
        .where(eq(adminRequests.email, normalized));

      if (!reqRow) {
        return { error: 'Admin access request not found.', status: 404 };
      }

      const now = new Date();
      await tx
        .delete(adminAllowlist)
        .where(eq(adminAllowlist.email, normalized));

      await tx
        .update(users)
        .set({ role: 'participant', updatedAt: now })
        .where(eq(users.email, normalized));

      const [updatedReq] = await tx
        .update(adminRequests)
        .set({
          status: 'rejected',
          reviewedByEmail: normalizedOwner,
          reviewedAt: now,
          updatedAt: now
        })
        .where(eq(adminRequests.email, normalized))
        .returning();

      return { request: updatedReq, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to reject administrator request.', { cause: error });
  }
}

export async function revokeAdminAccess(targetEmail: string) {
  const normalized = targetEmail.trim().toLowerCase();
  if (normalized === OWNER_EMAIL) {
    return { error: 'Cannot revoke owner administrator privileges.', status: 400 };
  }

  try {
    return await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(adminAllowlist)
        .where(eq(adminAllowlist.email, normalized))
        .returning();

      if (deleted.length === 0) {
        return { error: 'Administrator entry not found.', status: 404 };
      }

      const now = new Date();
      await tx
        .update(users)
        .set({ role: 'participant', updatedAt: now })
        .where(eq(users.email, normalized));

      await tx
        .update(adminRequests)
        .set({
          status: 'rejected',
          reviewedByEmail: OWNER_EMAIL,
          reviewedAt: now,
          updatedAt: now
        })
        .where(eq(adminRequests.email, normalized));

      return { revoked: normalized, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to revoke administrator access.', { cause: error });
  }
}

const STARTER_COURSES = [
  {
    slug: 'python-programming',
    name: 'Python Programming',
    iconKey: 'python',
    description: 'Core syntax, data structures, scripting, automation, and problem solving with Python.',
    displayOrder: 1
  },
  {
    slug: 'java-programming',
    name: 'Java Programming',
    iconKey: 'java',
    description: 'Object-oriented programming, collections, exception handling, and backend fundamentals in Java.',
    displayOrder: 2
  },
  {
    slug: 'c-programming',
    name: 'C Programming',
    iconKey: 'c',
    description: 'Structured programming, pointers, memory management, arrays, and foundational algorithms.',
    displayOrder: 3
  },
  {
    slug: 'cpp-programming',
    name: 'C++ Programming',
    iconKey: 'cpp',
    description: 'Object-oriented C++, STL containers, templates, and competitive/system programming.',
    displayOrder: 4
  },
  {
    slug: 'web-development',
    name: 'Web Development (HTML, CSS, JavaScript)',
    iconKey: 'web',
    description: 'Responsive layouts, modern styling, DOM scripting, and interactive frontend web apps.',
    displayOrder: 5
  },
  {
    slug: 'computer-basics',
    name: 'Computer Basics',
    iconKey: 'basics',
    description: 'Operating systems, file management, typing, internet navigation, email, and digital safety.',
    displayOrder: 6
  },
  {
    slug: 'microsoft-office',
    name: 'Microsoft Office (Word, Excel, PowerPoint)',
    iconKey: 'office',
    description: 'Document formatting, spreadsheet formulas and pivot tables, and professional presentations.',
    displayOrder: 7
  },
  {
    slug: 'data-analytics',
    name: 'Data Analytics',
    iconKey: 'analytics',
    description: 'Data cleaning, SQL querying, spreadsheet modeling, dashboarding, and visual insights.',
    displayOrder: 8
  },
  {
    slug: 'digital-marketing',
    name: 'Digital Marketing',
    iconKey: 'marketing',
    description: 'SEO fundamentals, social media campaigns, content strategy, and online analytics.',
    displayOrder: 9
  },
  {
    slug: 'hardware-networking',
    name: 'Computer Hardware and Networking',
    iconKey: 'hardware',
    description: 'PC assembly, troubleshooting, OS installation, LAN configuration, and network security.',
    displayOrder: 10
  }
];

function computeDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export async function ensureStarterCourses(): Promise<void> {
  try {
    const existing = await db.select({ slug: courses.slug }).from(courses);
    const existingSlugs = new Set(existing.map((c) => c.slug));
    const missing = STARTER_COURSES.filter((c) => !existingSlugs.has(c.slug));
    if (missing.length === 0) return;

    await db
      .insert(courses)
      .values(missing)
      .onConflictDoNothing({ target: courses.slug });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to initialize digital skills courses.', {
      cause: error
    });
  }
}

export async function listPublicCourses() {
  try {
    await ensureStarterCourses();
    const allCourses = await db
      .select()
      .from(courses)
      .orderBy(asc(courses.displayOrder), asc(courses.id));

    const links = await db
      .select({
        courseId: institutionCourses.courseId,
        total: count()
      })
      .from(institutionCourses)
      .groupBy(institutionCourses.courseId);

    const countMap = new Map(links.map((l) => [l.courseId, Number(l.total)]));
    return allCourses.map((course) => ({
      ...course,
      institutionCount: countMap.get(course.id) ?? 0
    }));
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load courses.', { cause: error });
  }
}

export async function listTrainingInstitutions(filters?: {
  course?: string;
  search?: string;
  city?: string;
  area?: string;
  mode?: string;
  lat?: number;
  lng?: number;
}) {
  try {
    await ensureStarterCourses();

    const [allInstitutions, allLocations, allOfferings] = await Promise.all([
      db.select().from(institutions).orderBy(asc(institutions.name), desc(institutions.id)),
      db.select().from(institutionLocations).orderBy(desc(institutionLocations.isPrimary), asc(institutionLocations.id)),
      db
        .select({
          id: institutionCourses.id,
          institutionId: institutionCourses.institutionId,
          courseId: institutionCourses.courseId,
          courseSlug: courses.slug,
          courseName: courses.name,
          duration: institutionCourses.duration,
          trainingMode: institutionCourses.trainingMode
        })
        .from(institutionCourses)
        .innerJoin(courses, eq(institutionCourses.courseId, courses.id))
        .orderBy(asc(courses.displayOrder))
    ]);

    const locationsByInst = new Map<number, typeof allLocations>();
    for (const loc of allLocations) {
      const list = locationsByInst.get(loc.institutionId) ?? [];
      list.push(loc);
      locationsByInst.set(loc.institutionId, list);
    }

    const coursesByInst = new Map<number, typeof allOfferings>();
    for (const off of allOfferings) {
      const list = coursesByInst.get(off.institutionId) ?? [];
      list.push(off);
      coursesByInst.set(off.institutionId, list);
    }

    const hasUserCoords =
      typeof filters?.lat === 'number' &&
      Number.isFinite(filters.lat) &&
      typeof filters?.lng === 'number' &&
      Number.isFinite(filters.lng);

    const hydrated = allInstitutions.map((inst) => {
      const locs = locationsByInst.get(inst.id) ?? [];
      const offs = coursesByInst.get(inst.id) ?? [];
      const primary = locs[0];
      let distanceKm: number | null = null;
      if (
        hasUserCoords &&
        primary &&
        typeof primary.latitude === 'number' &&
        typeof primary.longitude === 'number'
      ) {
        distanceKm = computeDistanceKm(
          filters!.lat!,
          filters!.lng!,
          primary.latitude,
          primary.longitude
        );
      }
      return {
        ...inst,
        locations: locs,
        courses: offs,
        distanceKm
      };
    });

    const courseFilter = filters?.course?.trim().toLowerCase() || '';
    const searchFilter = filters?.search?.trim().toLowerCase() || '';
    const cityFilter = filters?.city?.trim().toLowerCase() || '';
    const areaFilter = filters?.area?.trim().toLowerCase() || '';
    const modeFilter = filters?.mode?.trim().toLowerCase() || '';

    const filtered = hydrated.filter((inst) => {
      if (courseFilter) {
        const matchesCourse = inst.courses.some(
          (c) =>
            c.courseSlug.toLowerCase() === courseFilter ||
            String(c.courseId) === courseFilter
        );
        if (!matchesCourse) return false;
      }

      if (modeFilter) {
        const instMode = inst.trainingMode.toLowerCase();
        if (modeFilter === 'hybrid') {
          if (instMode !== 'hybrid') return false;
        } else if (instMode !== modeFilter && instMode !== 'hybrid') {
          return false;
        }
      }

      if (cityFilter) {
        const hasCity = inst.locations.some(
          (loc) => loc.city.trim().toLowerCase() === cityFilter
        );
        if (!hasCity) return false;
      }

      if (areaFilter) {
        const hasArea = inst.locations.some(
          (loc) => loc.area.trim().toLowerCase() === areaFilter
        );
        if (!hasArea) return false;
      }

      if (searchFilter) {
        const haystack = [
          inst.name,
          inst.description,
          ...inst.locations.flatMap((l) => [l.address, l.city, l.area]),
          ...inst.courses.map((c) => c.courseName)
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchFilter)) return false;
      }

      return true;
    });

    if (hasUserCoords) {
      filtered.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) {
          return a.name.localeCompare(b.name);
        }
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    return filtered;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to load training institutions.', { cause: error });
  }
}

export async function createTrainingInstitution(params: {
  name: string;
  logoUrl: string;
  imageUrl: string;
  phone: string;
  website: string;
  trainingMode: string;
  description: string;
  isVerified: boolean;
  placeId: string | null;
  address: string;
  city: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  courses: Array<{
    courseId: number;
    duration: string;
    trainingMode?: string | null;
  }>;
}) {
  try {
    await ensureStarterCourses();

    return await db.transaction(async (tx) => {
      const courseIds = Array.from(new Set(params.courses.map((c) => c.courseId)));
      if (courseIds.length > 0) {
        const validCourses = await tx
          .select({ id: courses.id })
          .from(courses)
          .where(inArray(courses.id, courseIds));
        if (validCourses.length !== courseIds.length) {
          return { error: 'One or more selected courses do not exist.', status: 400 };
        }
      }

      const [inst] = await tx
        .insert(institutions)
        .values({
          name: params.name,
          logoUrl: params.logoUrl,
          imageUrl: params.imageUrl,
          phone: params.phone,
          website: params.website,
          trainingMode: params.trainingMode,
          description: params.description,
          isVerified: params.isVerified,
          placeId: params.placeId
        })
        .returning();

      const [loc] = await tx
        .insert(institutionLocations)
        .values({
          institutionId: inst.id,
          address: params.address,
          city: params.city,
          area: params.area,
          latitude: params.latitude,
          longitude: params.longitude,
          googleMapsUrl: params.googleMapsUrl,
          isPrimary: true
        })
        .returning();

      const seenCourseIds = new Set<number>();
      for (const c of params.courses) {
        if (seenCourseIds.has(c.courseId)) continue;
        seenCourseIds.add(c.courseId);
        await tx.insert(institutionCourses).values({
          institutionId: inst.id,
          courseId: c.courseId,
          duration: c.duration,
          trainingMode: c.trainingMode || null
        });
      }

      return { institution: inst, location: loc, status: 201 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to create training institution.', { cause: error });
  }
}

export async function updateTrainingInstitution(
  id: number,
  params: {
    name: string;
    logoUrl: string;
    imageUrl: string;
    phone: string;
    website: string;
    trainingMode: string;
    description: string;
    isVerified: boolean;
    placeId: string | null;
    address: string;
    city: string;
    area: string;
    latitude: number | null;
    longitude: number | null;
    googleMapsUrl: string;
    courses: Array<{
      courseId: number;
      duration: string;
      trainingMode?: string | null;
    }>;
  }
) {
  try {
    await ensureStarterCourses();

    return await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(institutions)
        .where(eq(institutions.id, id));
      if (!existing) {
        return { error: 'Training institution not found.', status: 404 };
      }

      const courseIds = Array.from(new Set(params.courses.map((c) => c.courseId)));
      if (courseIds.length > 0) {
        const validCourses = await tx
          .select({ id: courses.id })
          .from(courses)
          .where(inArray(courses.id, courseIds));
        if (validCourses.length !== courseIds.length) {
          return { error: 'One or more selected courses do not exist.', status: 400 };
        }
      }

      const [updated] = await tx
        .update(institutions)
        .set({
          name: params.name,
          logoUrl: params.logoUrl,
          imageUrl: params.imageUrl,
          phone: params.phone,
          website: params.website,
          trainingMode: params.trainingMode,
          description: params.description,
          isVerified: params.isVerified,
          placeId: params.placeId,
          updatedAt: new Date()
        })
        .where(eq(institutions.id, id))
        .returning();

      const existingLocs = await tx
        .select()
        .from(institutionLocations)
        .where(eq(institutionLocations.institutionId, id))
        .orderBy(desc(institutionLocations.isPrimary), asc(institutionLocations.id));

      if (existingLocs[0]) {
        await tx
          .update(institutionLocations)
          .set({
            address: params.address,
            city: params.city,
            area: params.area,
            latitude: params.latitude,
            longitude: params.longitude,
            googleMapsUrl: params.googleMapsUrl,
            isPrimary: true
          })
          .where(eq(institutionLocations.id, existingLocs[0].id));
      } else {
        await tx.insert(institutionLocations).values({
          institutionId: id,
          address: params.address,
          city: params.city,
          area: params.area,
          latitude: params.latitude,
          longitude: params.longitude,
          googleMapsUrl: params.googleMapsUrl,
          isPrimary: true
        });
      }

      await tx
        .delete(institutionCourses)
        .where(eq(institutionCourses.institutionId, id));

      const seenCourseIds = new Set<number>();
      for (const c of params.courses) {
        if (seenCourseIds.has(c.courseId)) continue;
        seenCourseIds.add(c.courseId);
        await tx.insert(institutionCourses).values({
          institutionId: id,
          courseId: c.courseId,
          duration: c.duration,
          trainingMode: c.trainingMode || null
        });
      }

      return { institution: updated, status: 200 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to update training institution.', { cause: error });
  }
}

export async function deleteTrainingInstitution(id: number) {
  try {
    const deleted = await db
      .delete(institutions)
      .where(eq(institutions.id, id))
      .returning();

    if (deleted.length === 0) {
      return { error: 'Training institution not found.', status: 404 };
    }
    return { deletedId: id, status: 200 };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to delete training institution.', { cause: error });
  }
}

