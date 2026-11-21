import { relations } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('participant'),
  fullName: text('full_name'),
  age: integer('age'),
  gender: text('gender'),
  phone: text('phone'),
  address: text('address'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const adminAllowlist = pgTable('admin_allowlist', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  invitedByEmail: text('invited_by_email').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const adminRequests = pgTable('admin_requests', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull().unique(),
  fullName: text('full_name'),
  reason: text('reason').notNull().default(''),
  status: text('status').notNull().default('pending'),
  reviewedByEmail: text('reviewed_by_email'),
  reviewedAt: timestamp('reviewed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const workshops = pgTable('workshops', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  description: text('description').notNull(),
  duration: text('duration').notNull(),
  workshopDate: text('workshop_date').notNull(),
  startTime: text('start_time').notNull(),
  capacity: integer('capacity').notNull(),
  location: text('location').notNull(),
  status: text('status').notNull().default('open'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  workshopId: integer('workshop_id')
    .references(() => workshops.id, { onDelete: 'cascade' })
    .notNull(),
  sessionDate: text('session_date').notNull(),
  startTime: text('start_time').notNull(),
  qrToken: text('qr_token').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const registrations = pgTable(
  'registrations',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    workshopId: integer('workshop_id')
      .references(() => workshops.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull().default('confirmed'),
    registeredAt: timestamp('registered_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('registrations_user_workshop_idx').on(
      table.userUid,
      table.workshopId
    )
  ]
);

export const attendance = pgTable(
  'attendance',
  {
    id: serial('id').primaryKey(),
    registrationId: integer('registration_id')
      .references(() => registrations.id, { onDelete: 'cascade' })
      .notNull(),
    sessionId: integer('session_id')
      .references(() => sessions.id, { onDelete: 'cascade' })
      .notNull(),
    status: text('status').notNull(),
    markedAt: timestamp('marked_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('attendance_reg_session_idx').on(
      table.registrationId,
      table.sessionId
    )
  ]
);

export const feedback = pgTable(
  'feedback',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    workshopId: integer('workshop_id')
      .references(() => workshops.id, { onDelete: 'cascade' })
      .notNull(),
    rating: integer('rating').notNull(),
    comments: text('comments').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('feedback_user_workshop_idx').on(
      table.userUid,
      table.workshopId
    )
  ]
);

export const certificates = pgTable(
  'certificates',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    workshopId: integer('workshop_id')
      .references(() => workshops.id, { onDelete: 'cascade' })
      .notNull(),
    certificateCode: text('certificate_code').notNull().unique(),
    issuedAt: timestamp('issued_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('certificates_user_workshop_idx').on(
      table.userUid,
      table.workshopId
    )
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  registrations: many(registrations),
  feedback: many(feedback),
  certificates: many(certificates)
}));

export const workshopsRelations = relations(workshops, ({ many }) => ({
  sessions: many(sessions),
  registrations: many(registrations),
  feedback: many(feedback),
  certificates: many(certificates)
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  workshop: one(workshops, {
    fields: [sessions.workshopId],
    references: [workshops.id]
  }),
  attendance: many(attendance)
}));

export const registrationsRelations = relations(
  registrations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [registrations.userUid],
      references: [users.uid]
    }),
    workshop: one(workshops, {
      fields: [registrations.workshopId],
      references: [workshops.id]
    }),
    attendance: many(attendance)
  })
);
