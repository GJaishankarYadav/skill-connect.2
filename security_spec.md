# SkillConnect Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Admin Authority & Email Verification**: Only authenticated users with `request.auth.token.email_verified == true` can perform authenticated writes. Admin privileges are granted exclusively via the bootstrapped runtime admin email (`shankargopana@gmail.com`) or a trusted `/admins/{uid}` record. Users cannot self-assign admin roles.
2. **Strict PII Isolation**: Participant PII (`email`, `phone`, `address`, `age`, `gender`) resides exclusively in `/users/{userId}/private/pii` and is readable only by the owning user or an administrator. Publicly readable collections (`workshops`, `feedback`, `certificates`) contain zero PII.
3. **Atomic Registration & Capacity Protection**: A registration document `/registrations/{userId}_{workshopId}` can only be created when the target workshop exists, has `status == 'open'`, `registeredCount < capacity`, and the workshop's `registeredCount` is atomically incremented by `+1` in the same batch (`getAfter` / `existsAfter`).
4. **QR Token Non-Enumeration**: `/sessions` (which hold all `qrToken` values) are readable only by admins. `/qrTokens/{token}` forbids `list` queries (`allow list: if false`) so tokens cannot be scraped; participants can only `get` a token they scanned and can only mark themselves `present` if they already hold a valid registration for that workshop.
5. **Immutable Audit Fields & Server Timestamps**: `createdAt`, `registeredAt`, `issuedAt`, `userId`, and `workshopId` cannot be mutated after creation. All timestamps must equal `request.time`.
6. **Certificate Eligibility**: Certificates can only be created by an admin for an existing registration and follow the strict `SC-[A-Z0-9]+` code format.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified Email Spoof**: `{ "email": "shankargopana@gmail.com", "email_verified": false }` attempting to create a workshop in `/workshops/w1`. Expected: `PERMISSION_DENIED`.
2. **Self-Assigned Admin Privilege Escalation**: Non-admin user writing `{ "uid": "attacker", "name": "Evil", "email": "evil@example.com", "role": "admin", "createdAt": "request.time" }` to `/admins/attacker`. Expected: `PERMISSION_DENIED`.
3. **Shadow Field Injection on Registration**: Verified user creating `/registrations/u1_w1` with `{ "userId": "u1", "participantName": "Alice", "workshopId": "w1", "workshopName": "Tailoring", "status": "confirmed", "registeredAt": "request.time", "isVip": true }`. Expected: `PERMISSION_DENIED`.
4. **Identity Spoofing on Registration**: Verified user `u1` creating `/registrations/u2_w1` with `userId: "u2"`. Expected: `PERMISSION_DENIED`.
5. **Over-Capacity / Non-Atomic Registration**: User `u1` creating `/registrations/u1_w1` without atomically incrementing `/workshops/w1.registeredCount` by 1. Expected: `PERMISSION_DENIED`.
6. **Workshop Capacity Tampering by Participant**: Participant updating `/workshops/w1` with `{ "capacity": 999, "updatedAt": "request.time" }`. Expected: `PERMISSION_DENIED`.
7. **PII Blanket Read Attack**: User `u2` attempting `get` on `/users/u1/private/pii` or `list` on `/registrations` without owning `u1`. Expected: `PERMISSION_DENIED`.
8. **QR Token Enumeration**: Non-admin user attempting `list` on `/qrTokens` or `/sessions`. Expected: `PERMISSION_DENIED`.
9. **Fake QR Self Check-in**: Unregistered user `u1` attempting to create `/attendance/u1_s1` with `{ "status": "present", "qrToken": "forged_token" }`. Expected: `PERMISSION_DENIED`.
10. **ID Poisoning (1.5KB Document ID)**: Attempting to write to `/workshops/${'a'.repeat(1500)}`. Expected: `PERMISSION_DENIED`.
11. **Backdated Timestamp Spoofing**: Submitting `registeredAt` with a client-forged timestamp (`"2020-01-01T00:00:00Z"`) instead of `request.time`. Expected: `PERMISSION_DENIED`.
12. **Out-of-Range Feedback Rating / XSS Payload Size**: Submitting `/feedback/u1_w1` with `rating: 99` or `comments` > 1000 characters. Expected: `PERMISSION_DENIED`.
