import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  adminNotifyNextWaitlist,
  approveAdminRequest,
  cancelRegistrationById,
  confirmWaitlistSeat,
  createTrainingInstitution,
  createWorkshopWithSession,
  declineWaitlistEntry,
  deleteTrainingInstitution,
  getAdminOverview,
  getCertificateByCode,
  getMyAdminRequest,
  getUserProfileAndActivity,
  grantAdminAccess,
  issueCertificateForRegistration,
  joinWorkshopWaitlist,
  listAuthorizedAdmins,
  listPublicCourses,
  listPublicFeedback,
  listPublicWorkshops,
  listTrainingInstitutions,
  lookupQrSession,
  markNotificationsRead,
  markQrAttendance,
  registerParticipantForWorkshop,
  rejectAdminRequest,
  revokeAdminAccess,
  saveSessionAttendance,
  scanParticipantQrAttendance,
  submitAdminRequest,
  updateTrainingInstitution,
  updateWorkshopDetails,
  upsertFeedback
} from './src/db/queries.ts';
import {
  requireAdmin,
  requireAuth,
  requireOwner,
  type AuthRequest
} from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMapsApiKey(): string {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();
}

function sanitizeImageOrUrl(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/')) {
    return trimmed.slice(0, 600_000);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, maxLen);
  }
  return '';
}

function sanitizeWebUrl(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.slice(0, maxLen);
  }
  return `https://${trimmed}`.slice(0, maxLen);
}

function validateInstitutionBody(body: Record<string, unknown> | undefined) {
  if (!body) return { error: 'Request body is required.' } as const;

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const area = typeof body.area === 'string' ? body.area.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const trainingMode =
    typeof body.trainingMode === 'string' ? body.trainingMode.trim() : 'Offline';

  if (name.length < 2) {
    return { error: 'Institution name must be at least 2 characters.' } as const;
  }
  if (!['Online', 'Offline', 'Hybrid'].includes(trainingMode)) {
    return { error: 'Training mode must be Online, Offline, or Hybrid.' } as const;
  }
  if (address.length < 3) {
    return { error: 'Complete address is required (at least 3 characters).' } as const;
  }
  if (city.length < 2) {
    return { error: 'City is required.' } as const;
  }
  if (description.length < 5) {
    return { error: 'Institution description must be at least 5 characters.' } as const;
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  if (
    body.latitude !== undefined &&
    body.latitude !== null &&
    String(body.latitude).trim() !== ''
  ) {
    const lat = Number(body.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return { error: 'Latitude must be between -90 and 90.' } as const;
    }
    latitude = lat;
  }
  if (
    body.longitude !== undefined &&
    body.longitude !== null &&
    String(body.longitude).trim() !== ''
  ) {
    const lng = Number(body.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return { error: 'Longitude must be between -180 and 180.' } as const;
    }
    longitude = lng;
  }

  const rawCourses = Array.isArray(body.courses) ? body.courses : [];
  const parsedCourses: Array<{
    courseId: number;
    duration: string;
    trainingMode?: string | null;
  }> = [];

  for (const item of rawCourses) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const courseId = Number.parseInt(String(rec.courseId ?? ''), 10);
    if (Number.isNaN(courseId) || courseId <= 0) continue;
    const duration =
      typeof rec.duration === 'string' ? rec.duration.trim().slice(0, 80) : '';
    const modeOverride =
      typeof rec.trainingMode === 'string' &&
      ['Online', 'Offline', 'Hybrid'].includes(rec.trainingMode)
        ? rec.trainingMode
        : null;
    parsedCourses.push({
      courseId,
      duration,
      trainingMode: modeOverride
    });
  }

  if (parsedCourses.length === 0) {
    return { error: 'Select at least one course offered by this institution.' } as const;
  }

  const placeId =
    typeof body.placeId === 'string' && body.placeId.trim()
      ? body.placeId.trim().slice(0, 160)
      : null;

  return {
    data: {
      name: name.slice(0, 160),
      logoUrl: sanitizeImageOrUrl(body.logoUrl, 500),
      imageUrl: sanitizeImageOrUrl(body.imageUrl, 500),
      phone: phone.slice(0, 40),
      website: sanitizeWebUrl(body.website, 300),
      trainingMode,
      description: description.slice(0, 1200),
      isVerified: Boolean(body.isVerified || placeId),
      placeId,
      address: address.slice(0, 320),
      city: city.slice(0, 100),
      area: area.slice(0, 120),
      latitude,
      longitude,
      googleMapsUrl: sanitizeWebUrl(body.googleMapsUrl, 400),
      courses: parsedCourses
    }
  } as const;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Public API routes
  app.get('/api/config/maps', (_req, res) => {
    const apiKey = (
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      ''
    ).trim();
    res.json({ apiKey });
  });

  app.get('/api/courses', async (_req, res) => {
    try {
      const items = await listPublicCourses();
      res.json({ courses: items });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load courses.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/institutions', async (req, res) => {
    try {
      const latRaw = req.query.lat;
      const lngRaw = req.query.lng;
      const lat =
        latRaw !== undefined && latRaw !== '' ? Number(latRaw) : undefined;
      const lng =
        lngRaw !== undefined && lngRaw !== '' ? Number(lngRaw) : undefined;

      const items = await listTrainingInstitutions({
        course: typeof req.query.course === 'string' ? req.query.course : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        city: typeof req.query.city === 'string' ? req.query.city : undefined,
        area: typeof req.query.area === 'string' ? req.query.area : undefined,
        mode: typeof req.query.mode === 'string' ? req.query.mode : undefined,
        lat: lat !== undefined && Number.isFinite(lat) ? lat : undefined,
        lng: lng !== undefined && Number.isFinite(lng) ? lng : undefined
      });
      res.json({ institutions: items });
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to load institutions.';
      res.status(500).json({ error: msg });
    }
  });
  app.get('/api/workshops', async (_req, res) => {
    try {
      const items = await listPublicWorkshops();
      res.json({ workshops: items });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load workshops.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/feedback', async (_req, res) => {
    try {
      const items = await listPublicFeedback();
      res.json({ feedback: items });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load feedback.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/certificates/:code', async (req, res) => {
    try {
      const code = String(req.params.code || '').trim().toUpperCase();
      if (!/^SC-[A-Z0-9]+$/.test(code)) {
        res.status(400).json({ error: 'Invalid certificate code format.' });
        return;
      }
      const cert = await getCertificateByCode(code);
      if (!cert) {
        res.status(404).json({ error: 'Certificate not found.' });
        return;
      }
      res.json({ certificate: cert });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load certificate.';
      res.status(500).json({ error: msg });
    }
  });

  // Authenticated participant API routes
  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const data = await getUserProfileAndActivity(uid);
      const isOwner = Boolean(req.isOwner);
      const isAdmin = isOwner || req.dbUser?.role === 'admin';
      res.json({
        ...data,
        isAdmin,
        isOwner
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load profile.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/registrations', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { fullName, age, gender, phone, email, address, workshopId } = req.body ?? {};
      const parsedAge = Number.parseInt(String(age ?? ''), 10);
      const parsedWorkshopId = Number.parseInt(String(workshopId ?? ''), 10);

      if (
        typeof fullName !== 'string' ||
        fullName.trim().length < 2 ||
        Number.isNaN(parsedAge) ||
        parsedAge < 10 ||
        parsedAge > 100 ||
        typeof gender !== 'string' ||
        !['Female', 'Male', 'Other', 'Prefer not to say'].includes(gender) ||
        typeof phone !== 'string' ||
        phone.trim().length < 5 ||
        typeof email !== 'string' ||
        !email.includes('@') ||
        typeof address !== 'string' ||
        address.trim().length < 3 ||
        Number.isNaN(parsedWorkshopId)
      ) {
        res.status(400).json({ error: 'Please complete all required registration fields.' });
        return;
      }

      const result = await registerParticipantForWorkshop({
        uid,
        fullName: fullName.trim().slice(0, 120),
        age: parsedAge,
        gender,
        phone: phone.trim().slice(0, 32),
        email: email.trim().slice(0, 160),
        address: address.trim().slice(0, 300),
        workshopId: parsedWorkshopId
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to complete registration.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/registrations/:id/cancel', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid registration ID.' });
        return;
      }
      const isAdmin = Boolean(req.isOwner || req.dbUser?.role === 'admin');
      const result = await cancelRegistrationById(id, req.user!.uid, isAdmin);
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to cancel registration.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/waitlist', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { fullName, age, gender, phone, email, address, workshopId } = req.body ?? {};
      const parsedAge = Number.parseInt(String(age ?? ''), 10);
      const parsedWorkshopId = Number.parseInt(String(workshopId ?? ''), 10);

      if (
        typeof fullName !== 'string' ||
        fullName.trim().length < 2 ||
        Number.isNaN(parsedAge) ||
        parsedAge < 10 ||
        parsedAge > 100 ||
        typeof gender !== 'string' ||
        !['Female', 'Male', 'Other', 'Prefer not to say'].includes(gender) ||
        typeof phone !== 'string' ||
        phone.trim().length < 5 ||
        typeof email !== 'string' ||
        !email.includes('@') ||
        typeof address !== 'string' ||
        address.trim().length < 3 ||
        Number.isNaN(parsedWorkshopId)
      ) {
        res.status(400).json({ error: 'Please complete all required waiting list fields.' });
        return;
      }

      const result = await joinWorkshopWaitlist({
        uid,
        fullName: fullName.trim().slice(0, 120),
        age: parsedAge,
        gender,
        phone: phone.trim().slice(0, 32),
        email: email.trim().slice(0, 160),
        address: address.trim().slice(0, 300),
        workshopId: parsedWorkshopId
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to join waiting list.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/waitlist/:id/confirm', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid waitlist entry ID.' });
        return;
      }
      const result = await confirmWaitlistSeat(req.user!.uid, id);
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to confirm seat.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/waitlist/:id/decline', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid waitlist entry ID.' });
        return;
      }
      const isAdmin = Boolean(req.isOwner || req.dbUser?.role === 'admin');
      const result = await declineWaitlistEntry(id, req.user!.uid, isAdmin);
      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update waiting list.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rawId = req.body?.notificationId;
      const notificationId =
        rawId !== undefined && rawId !== null
          ? Number.parseInt(String(rawId), 10)
          : undefined;
      if (notificationId !== undefined && Number.isNaN(notificationId)) {
        res.status(400).json({ error: 'Invalid notification ID.' });
        return;
      }
      const result = await markNotificationsRead(req.user!.uid, notificationId);
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update notifications.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/feedback', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const { workshopId, rating, comments } = req.body ?? {};
      const parsedWorkshopId = Number.parseInt(String(workshopId ?? ''), 10);
      const parsedRating = Number.parseInt(String(rating ?? ''), 10);

      if (
        Number.isNaN(parsedWorkshopId) ||
        Number.isNaN(parsedRating) ||
        parsedRating < 1 ||
        parsedRating > 5
      ) {
        res.status(400).json({ error: 'Valid workshop and rating (1-5) are required.' });
        return;
      }

      const result = await upsertFeedback({
        uid,
        workshopId: parsedWorkshopId,
        rating: parsedRating,
        comments: typeof comments === 'string' ? comments.trim().slice(0, 1000) : ''
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit feedback.';
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/qr/:token', requireAuth, async (req: AuthRequest, res) => {
    try {
      const token = String(req.params.token || '').trim();
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
        res.status(404).json({ error: 'Invalid QR code.' });
        return;
      }
      const session = await lookupQrSession(token);
      if (!session) {
        res.status(404).json({ error: 'Invalid QR code.' });
        return;
      }
      res.json({ session });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to verify QR code.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/qr/:token', requireAuth, async (req: AuthRequest, res) => {
    try {
      const token = String(req.params.token || '').trim();
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(token)) {
        res.status(404).json({ code: 'invalid', error: 'Invalid QR code.' });
        return;
      }
      const result = await markQrAttendance(req.user!.uid, token);
      res.status(result.status).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to record attendance.';
      res.status(500).json({ error: msg });
    }
  });

  // Administrator API routes
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res) => {
      try {
        const overview = await getAdminOverview();
        res.json(overview);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to load overview.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/workshops',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const {
          name,
          category,
          description,
          duration,
          workshopDate,
          startTime,
          capacity,
          location
        } = req.body ?? {};
        const capNum = Number.parseInt(String(capacity ?? ''), 10);

        if (
          typeof name !== 'string' ||
          name.trim().length < 2 ||
          typeof category !== 'string' ||
          category.trim().length < 2 ||
          typeof description !== 'string' ||
          description.trim().length < 5 ||
          typeof duration !== 'string' ||
          duration.trim().length < 1 ||
          typeof workshopDate !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}$/.test(workshopDate) ||
          typeof startTime !== 'string' ||
          !/^\d{2}:\d{2}$/.test(startTime) ||
          Number.isNaN(capNum) ||
          capNum < 1 ||
          capNum > 5000 ||
          typeof location !== 'string' ||
          location.trim().length < 2
        ) {
          res.status(400).json({ error: 'Please fill out all workshop fields accurately.' });
          return;
        }

        const created = await createWorkshopWithSession({
          name: name.trim().slice(0, 140),
          category: category.trim().slice(0, 80),
          description: description.trim().slice(0, 1000),
          duration: duration.trim().slice(0, 60),
          workshopDate,
          startTime,
          capacity: capNum,
          location: location.trim().slice(0, 160)
        });

        res.status(201).json(created);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to create workshop.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.patch(
    '/api/admin/workshops/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid workshop ID.' });
          return;
        }

        const updates: { status?: string; capacity?: number } = {};
        if (req.body?.status !== undefined) {
          const status = String(req.body.status);
          if (!['open', 'closed', 'cancelled'].includes(status)) {
            res.status(400).json({ error: 'Invalid workshop status.' });
            return;
          }
          updates.status = status;
        }
        if (req.body?.capacity !== undefined) {
          const cap = Number.parseInt(String(req.body.capacity), 10);
          if (Number.isNaN(cap) || cap < 1 || cap > 5000) {
            res.status(400).json({ error: 'Capacity must be between 1 and 5000.' });
            return;
          }
          updates.capacity = cap;
        }

        if (updates.status === undefined && updates.capacity === undefined) {
          res.status(400).json({ error: 'Provide status or capacity to update.' });
          return;
        }

        const updated = await updateWorkshopDetails(id, updates);
        if (!updated) {
          res.status(404).json({ error: 'Workshop not found.' });
          return;
        }
        res.json(updated);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update workshop.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/workshops/:id/notify-waitlist',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid workshop ID.' });
          return;
        }
        const result = await adminNotifyNextWaitlist(id);
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to notify waitlist.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/registrations/:id/cancel',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid registration ID.' });
          return;
        }
        const result = await cancelRegistrationById(id, req.user!.uid, true);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to cancel registration.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/waitlist/:id/remove',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid waitlist entry ID.' });
          return;
        }
        const result = await declineWaitlistEntry(id, req.user!.uid, true);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to remove waitlist entry.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/attendance/scan',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const payload = String(req.body?.payload ?? '');
        const rawSessionId = req.body?.sessionId;
        const sessionId =
          rawSessionId !== undefined && rawSessionId !== null && rawSessionId !== ''
            ? Number.parseInt(String(rawSessionId), 10)
            : undefined;
        if (sessionId !== undefined && Number.isNaN(sessionId)) {
          res.status(400).json({ error: 'Invalid sessionId.' });
          return;
        }
        const result = await scanParticipantQrAttendance(payload, sessionId);
        res.status(result.status).json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to scan QR code.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/attendance',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const sessionId = Number.parseInt(String(req.body?.sessionId ?? ''), 10);
        const entries = req.body?.entries;
        if (Number.isNaN(sessionId) || !Array.isArray(entries)) {
          res.status(400).json({ error: 'Valid sessionId and entries are required.' });
          return;
        }

        const sanitized: Array<{
          registrationId: number;
          status: 'present' | 'absent';
        }> = [];
        for (const item of entries) {
          const rid = Number.parseInt(String(item?.registrationId ?? ''), 10);
          const status = item?.status;
          if (!Number.isNaN(rid) && (status === 'present' || status === 'absent')) {
            sanitized.push({ registrationId: rid, status });
          }
        }

        const result = await saveSessionAttendance(sessionId, sanitized);
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to save attendance.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/certificates',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const registrationId = Number.parseInt(
          String(req.body?.registrationId ?? ''),
          10
        );
        if (Number.isNaN(registrationId)) {
          res.status(400).json({ error: 'Valid registrationId is required.' });
          return;
        }

        const result = await issueCertificateForRegistration(registrationId);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.status(201).json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to issue certificate.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // Admin Training Institutions Management Routes
  app.get(
    '/api/admin/institutions',
    requireAuth,
    requireAdmin,
    async (_req: AuthRequest, res) => {
      try {
        const [courseList, institutionList] = await Promise.all([
          listPublicCourses(),
          listTrainingInstitutions()
        ]);
        res.json({ courses: courseList, institutions: institutionList });
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Failed to load training institutions.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/institutions',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const validated = validateInstitutionBody(
          req.body as Record<string, unknown> | undefined
        );
        if ('error' in validated) {
          res.status(400).json({ error: validated.error });
          return;
        }
        const result = await createTrainingInstitution(validated.data);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.status(201).json(result);
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Failed to create training institution.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.patch(
    '/api/admin/institutions/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid institution ID.' });
          return;
        }
        const validated = validateInstitutionBody(
          req.body as Record<string, unknown> | undefined
        );
        if ('error' in validated) {
          res.status(400).json({ error: validated.error });
          return;
        }
        const result = await updateTrainingInstitution(id, validated.data);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Failed to update training institution.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.delete(
    '/api/admin/institutions/:id',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const id = Number.parseInt(String(req.params.id), 10);
        if (Number.isNaN(id)) {
          res.status(400).json({ error: 'Invalid institution ID.' });
          return;
        }
        const result = await deleteTrainingInstitution(id);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg =
          error instanceof Error
            ? error.message
            : 'Failed to delete training institution.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/geocode',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const address = String(req.body?.address ?? '').trim();
        if (address.length < 3) {
          res.status(400).json({ error: 'Please enter a complete address to geocode.' });
          return;
        }

        const apiKey = getMapsApiKey();
        if (!apiKey) {
          res.status(503).json({
            error:
              'Google Maps API key is not configured on the server. Enter latitude/longitude coordinates manually or configure GOOGLE_MAPS_API_KEY.'
          });
          return;
        }

        const url = `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(address)}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'results.placeId,results.location,results.formattedAddress,results.postalAddress,results.addressComponents',
            'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
          }
        });

        const data = (await response.json()) as {
          results?: Array<{
            placeId?: string;
            formattedAddress?: string;
            location?: { latitude?: number; longitude?: number };
            postalAddress?: { locality?: string };
            addressComponents?: Array<{
              longText?: string;
              types?: string[];
            }>;
          }>;
          error?: { status?: string; message?: string };
        };

        if (
          response.status === 429 ||
          data?.error?.status === 'RESOURCE_EXHAUSTED'
        ) {
          res.status(429).json({
            quotaExceeded: true,
            error: data?.error?.message || 'Google Maps Platform quota reached.'
          });
          return;
        }

        if (!response.ok) {
          res.status(response.status).json({
            error: data?.error?.message || 'Unable to geocode this address.'
          });
          return;
        }

        const top = data.results?.[0];
        if (!top || !top.location) {
          res.status(404).json({
            error: 'No coordinates found for that address. Try adding city and country.'
          });
          return;
        }

        const comps = top.addressComponents ?? [];
        const locality =
          top.postalAddress?.locality ||
          comps.find((c) => c.types?.includes('locality'))?.longText ||
          '';
        const sublocality =
          comps.find(
            (c) =>
              c.types?.includes('sublocality_level_1') ||
              c.types?.includes('sublocality') ||
              c.types?.includes('neighborhood')
          )?.longText || '';

        res.json({
          latitude: top.location.latitude ?? null,
          longitude: top.location.longitude ?? null,
          formattedAddress: top.formattedAddress || address,
          placeId: top.placeId || null,
          city: locality,
          area: sublocality
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Failed to geocode address.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/admin/places/search',
    requireAuth,
    requireAdmin,
    async (req: AuthRequest, res) => {
      try {
        const query = String(req.body?.query ?? '').trim();
        if (query.length < 2) {
          res.status(400).json({ error: 'Enter an institute name or query to search.' });
          return;
        }

        const apiKey = getMapsApiKey();
        if (!apiKey) {
          res.status(503).json({
            error:
              'Google Maps API key is not configured on the server. Add the institution details manually or configure GOOGLE_MAPS_API_KEY.'
          });
          return;
        }

        const response = await fetch(
          'https://places.googleapis.com/v1/places:searchText',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask':
                'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri',
              'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio'
            },
            body: JSON.stringify({
              textQuery: query,
              pageSize: 8
            })
          }
        );

        const data = (await response.json()) as {
          places?: Array<{
            id?: string;
            displayName?: { text?: string };
            formattedAddress?: string;
            addressComponents?: Array<{
              longText?: string;
              types?: string[];
            }>;
            location?: { latitude?: number; longitude?: number };
            googleMapsUri?: string;
            nationalPhoneNumber?: string;
            internationalPhoneNumber?: string;
            websiteUri?: string;
          }>;
          error?: { status?: string; message?: string };
        };

        if (
          response.status === 429 ||
          data?.error?.status === 'RESOURCE_EXHAUSTED'
        ) {
          res.status(429).json({
            quotaExceeded: true,
            error: data?.error?.message || 'Google Maps Platform quota reached.'
          });
          return;
        }

        if (!response.ok) {
          res.status(response.status).json({
            error: data?.error?.message || 'Verified place search failed.'
          });
          return;
        }

        const candidates = (data.places ?? []).map((p) => {
          const comps = p.addressComponents ?? [];
          const city =
            comps.find((c) => c.types?.includes('locality'))?.longText ||
            comps.find((c) => c.types?.includes('administrative_area_level_2'))
              ?.longText ||
            '';
          const area =
            comps.find(
              (c) =>
                c.types?.includes('sublocality_level_1') ||
                c.types?.includes('sublocality') ||
                c.types?.includes('neighborhood')
            )?.longText || '';
          return {
            placeId: p.id || '',
            name: p.displayName?.text || '',
            formattedAddress: p.formattedAddress || '',
            city,
            area,
            phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
            website: p.websiteUri || '',
            latitude: p.location?.latitude ?? null,
            longitude: p.location?.longitude ?? null,
            googleMapsUrl: p.googleMapsUri || ''
          };
        });

        res.json({ places: candidates });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'Failed to search Google Places.';
        res.status(500).json({ error: msg });
      }
    }
  );

  // Authenticated User Admin-Join Request Routes
  app.get('/api/admin-request/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const request = await getMyAdminRequest(req.user!.email!);
      res.json({ request });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load admin request.';
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/admin-request', requireAuth, async (req: AuthRequest, res) => {
    try {
      if (req.isOwner || req.dbUser?.role === 'admin') {
        res.status(400).json({ error: 'You already have administrator access.' });
        return;
      }

      const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
      const result = await submitAdminRequest({
        uid: req.user!.uid,
        email: req.user!.email!,
        fullName: req.dbUser?.fullName || (typeof req.user?.name === 'string' ? req.user.name : null),
        reason
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit admin access request.';
      res.status(500).json({ error: msg });
    }
  });

  // Owner-only Administrator Authorization Routes
  app.get(
    '/api/owner/admins',
    requireAuth,
    requireOwner,
    async (_req: AuthRequest, res) => {
      try {
        const list = await listAuthorizedAdmins();
        res.json(list);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to load administrators.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/owner/admins',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        const email = String(req.body?.email ?? '').trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
          res.status(400).json({ error: 'Please enter a valid email address.' });
          return;
        }

        const result = await grantAdminAccess(email, req.user!.email!);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.status(201).json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to authorize administrator.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/owner/admin-requests/:email/approve',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        const email = decodeURIComponent(String(req.params.email || '')).trim().toLowerCase();
        if (!email) {
          res.status(400).json({ error: 'Email is required.' });
          return;
        }

        const result = await approveAdminRequest(email, req.user!.email!);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to approve admin request.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.post(
    '/api/owner/admin-requests/:email/reject',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        const email = decodeURIComponent(String(req.params.email || '')).trim().toLowerCase();
        if (!email) {
          res.status(400).json({ error: 'Email is required.' });
          return;
        }

        const result = await rejectAdminRequest(email, req.user!.email!);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to reject admin request.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.delete(
    '/api/owner/admins/:email',
    requireAuth,
    requireOwner,
    async (req: AuthRequest, res) => {
      try {
        const email = decodeURIComponent(String(req.params.email || '')).trim().toLowerCase();
        if (!email) {
          res.status(400).json({ error: 'Email is required.' });
          return;
        }

        const result = await revokeAdminAccess(email);
        if ('error' in result) {
          res.status(result.status).json({ error: result.error });
          return;
        }
        res.json(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to revoke administrator.';
        res.status(500).json({ error: msg });
      }
    }
  );

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');
  const hasDist = fs.existsSync(distDir);
  const hasVite = fs.existsSync(path.resolve(__dirname, 'node_modules/vite'));

  if ((isProd && hasDist) || (hasDist && !hasVite)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        ws: { server: httpServer },
        watch: process.env.DISABLE_HMR === 'true' ? null : {}
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  const port = Number(process.env.PORT || 3000);
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`SkillConnect server running at http://0.0.0.0:${port}`);
  });
}

void startServer();
