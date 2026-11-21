/**
 * Phase 0 TDD Verification Suite for SkillConnect Firestore Security Rules.
 * Covers all 12 "Dirty Dozen" adversarial payloads defined in security_spec.md.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_CASES: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unverified Email Spoof on Admin Workshop Create',
    operation: 'create',
    path: '/workshops/w1',
    auth: { uid: 'spoof-uid', email: 'shankargopana@gmail.com', email_verified: false },
    payload: {
      name: 'Spoofed Workshop',
      category: 'Tech',
      description: 'Should fail due to unverified email',
      duration: '2 Weeks',
      workshopDate: '2026-12-12',
      startTime: '09:00',
      capacity: 20,
      registeredCount: 0,
      location: 'Main Hall',
      status: 'open',
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 2,
    name: 'Self-Assigned Admin Privilege Escalation',
    operation: 'create',
    path: '/admins/attacker-uid',
    auth: { uid: 'attacker-uid', email: 'attacker@example.com', email_verified: true },
    payload: {
      uid: 'attacker-uid',
      name: 'Evil Admin',
      email: 'attacker@example.com',
      role: 'admin',
      createdAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Registration',
    operation: 'create',
    path: '/registrations/user1_w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user1',
      participantName: 'Alice',
      workshopId: 'w1',
      workshopName: 'Tailoring',
      status: 'confirmed',
      registeredAt: 'REQUEST_TIME',
      isVip: true
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 4,
    name: 'Identity Spoofing on Registration',
    operation: 'create',
    path: '/registrations/user2_w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user2',
      participantName: 'Bob',
      workshopId: 'w1',
      workshopName: 'Tailoring',
      status: 'confirmed',
      registeredAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 5,
    name: 'Non-Atomic Registration without Workshop Increment',
    operation: 'create',
    path: '/registrations/user1_w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user1',
      participantName: 'Alice',
      workshopId: 'w1',
      workshopName: 'Tailoring',
      status: 'confirmed',
      registeredAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 6,
    name: 'Workshop Capacity Tampering by Non-Admin',
    operation: 'update',
    path: '/workshops/w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      capacity: 999,
      updatedAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 7,
    name: 'PII Blanket Read Attack by Non-Owner',
    operation: 'get',
    path: '/users/user1/private/pii',
    auth: { uid: 'user2', email: 'user2@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 8,
    name: 'QR Token Enumeration via List Query',
    operation: 'list',
    path: '/qrTokens',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 9,
    name: 'Fake QR Self Check-in with Forged Token',
    operation: 'create',
    path: '/attendance/user1_s1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user1',
      participantName: 'Alice',
      workshopId: 'w1',
      sessionId: 's1',
      registrationId: 'user1_w1',
      status: 'present',
      qrToken: 'forged_token_123456',
      markedAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 10,
    name: 'ID Poisoning (1.5KB Document ID)',
    operation: 'create',
    path: `/workshops/${'a'.repeat(1500)}`,
    auth: { uid: 'admin', email: 'shankargopana@gmail.com', email_verified: true },
    payload: {
      name: 'Poison',
      category: 'Tech',
      description: 'Long ID poisoning attempt',
      duration: '1 Day',
      workshopDate: '2026-12-12',
      startTime: '09:00',
      capacity: 10,
      registeredCount: 0,
      location: 'Room 1',
      status: 'open',
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 11,
    name: 'Backdated Timestamp Spoofing on Feedback',
    operation: 'create',
    path: '/feedback/user1_w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user1',
      authorName: 'Alice',
      workshopId: 'w1',
      workshopName: 'Tailoring',
      rating: 5,
      comments: 'Great workshop',
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z'
    },
    expected: 'PERMISSION_DENIED'
  },
  {
    id: 12,
    name: 'Out-of-Range Feedback Rating / Oversized Comments',
    operation: 'create',
    path: '/feedback/user1_w1',
    auth: { uid: 'user1', email: 'user1@example.com', email_verified: true },
    payload: {
      userId: 'user1',
      authorName: 'Alice',
      workshopId: 'w1',
      workshopName: 'Tailoring',
      rating: 99,
      comments: 'x'.repeat(1500),
      createdAt: 'REQUEST_TIME',
      updatedAt: 'REQUEST_TIME'
    },
    expected: 'PERMISSION_DENIED'
  }
];
