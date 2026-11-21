import crypto from 'crypto';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from './index.ts';
import {
  adminAllowlist,
  adminRequests,
  attendance,
  certificates,
  feedback,
  registrations,
  sessions,
  users,
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

    const countMap = new Map(counts.map((c) => [c.workshopId, Number(c.total)]));
    return rows.map((w) => ({
      ...w,
      registeredCount: countMap.get(w.id) ?? 0
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

    const myRegs = await db
      .select({
        id: registrations.id,
        workshopId: registrations.workshopId,
        workshopName: workshops.name,
        status: registrations.status,
        registeredAt: registrations.registeredAt
      })
      .from(registrations)
      .innerJoin(workshops, eq(registrations.workshopId, workshops.id))
      .where(eq(registrations.userUid, uid))
      .orderBy(desc(registrations.registeredAt));

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

    return {
      profile: profile || null,
      registrations: myRegs,
      certificates: myCerts
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

      if (Number(total) >= workshop.capacity) {
        return { error: 'This workshop is already full.', status: 400 };
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

      const [registration] = await tx
        .insert(registrations)
        .values({
          userUid: params.uid,
          workshopId: params.workshopId,
          status: 'confirmed'
        })
        .returning();

      return { registration, workshopName: workshop.name, status: 201 };
    });
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to complete registration.', { cause: error });
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

    const [reg] = await db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.userUid, uid),
          eq(registrations.workshopId, session.workshopId)
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

    await db
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

    return {
      status: 200,
      code: 'marked',
      workshopName: session.workshopName
    };
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to record QR attendance.', { cause: error });
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

    const regCountByWorkshop = new Map<number, number>();
    for (const r of allRegs) {
      if (r.status === 'confirmed') {
        regCountByWorkshop.set(
          r.workshopId,
          (regCountByWorkshop.get(r.workshopId) ?? 0) + 1
        );
      }
    }

    return {
      workshops: allWorkshops.map((w) => ({
        ...w,
        registeredCount: regCountByWorkshop.get(w.id) ?? 0
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
      }))
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

export async function updateWorkshopStatus(id: number, status: string) {
  try {
    const [updated] = await db
      .update(workshops)
      .set({ status })
      .where(eq(workshops.id, id))
      .returning();
    return updated || null;
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Failed to update workshop status.', { cause: error });
  }
}

export async function saveSessionAttendance(
  sessionId: number,
  entries: Array<{ registrationId: number; status: 'present' | 'absent' }>
) {
  try {
    await db.transaction(async (tx) => {
      for (const entry of entries) {
        await tx
          .insert(attendance)
          .values({
            registrationId: entry.registrationId,
            sessionId,
            status: entry.status
          })
          .onConflictDoUpdate({
            target: [attendance.registrationId, attendance.sessionId],
            set: {
              status: entry.status,
              markedAt: new Date()
            }
          });
      }
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

      const code = `SC-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      const [created] = await tx
        .insert(certificates)
        .values({
          userUid: reg.userUid,
          workshopId: reg.workshopId,
          certificateCode: code
        })
        .returning();

      return { certificate: created, status: 201 };
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

