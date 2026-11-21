import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import {
  approveAdminRequest,
  createWorkshopWithSession,
  getAdminOverview,
  getCertificateByCode,
  getMyAdminRequest,
  getUserProfileAndActivity,
  grantAdminAccess,
  issueCertificateForRegistration,
  listAuthorizedAdmins,
  listPublicFeedback,
  listPublicWorkshops,
  lookupQrSession,
  markQrAttendance,
  registerParticipantForWorkshop,
  rejectAdminRequest,
  revokeAdminAccess,
  saveSessionAttendance,
  submitAdminRequest,
  updateWorkshopStatus,
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

async function startServer() {
  const app = express();
  app.use(express.json());

  // Public API routes
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
        const status = String(req.body?.status || '');
        if (
          Number.isNaN(id) ||
          !['open', 'closed', 'cancelled'].includes(status)
        ) {
          res.status(400).json({ error: 'Invalid workshop ID or status.' });
          return;
        }
        const updated = await updateWorkshopStatus(id, status);
        if (!updated) {
          res.status(404).json({ error: 'Workshop not found.' });
          return;
        }
        res.json({ workshop: updated });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to update workshop.';
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

        await saveSessionAttendance(sessionId, sanitized);
        res.json({ saved: sanitized.length });
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

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
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
