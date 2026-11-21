import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { adminAllowlist, users } from './schema.ts';

export const OWNER_EMAIL = 'skillconnect751@gmail.com';
export const ADMIN_EMAIL = OWNER_EMAIL;

export function isOwnerEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  return Boolean(emailVerified) && Boolean(email) && email!.trim().toLowerCase() === OWNER_EMAIL;
}

export async function getOrCreateUser(
  uid: string,
  email: string,
  emailVerified: boolean,
  displayName?: string
) {
  const normalizedEmail = email.trim().toLowerCase();

  try {
    let resolvedRole = 'participant';
    if (isOwnerEmail(normalizedEmail, emailVerified)) {
      resolvedRole = 'owner';
    } else if (emailVerified) {
      const [allowed] = await db
        .select({ id: adminAllowlist.id })
        .from(adminAllowlist)
        .where(eq(adminAllowlist.email, normalizedEmail));
      if (allowed) {
        resolvedRole = 'admin';
      }
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        role: resolvedRole,
        fullName: displayName || null
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: normalizedEmail,
          role: resolvedRole,
          updatedAt: new Date()
        }
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed:', error);
    throw new Error('Unable to synchronize user profile.', { cause: error });
  }
}
