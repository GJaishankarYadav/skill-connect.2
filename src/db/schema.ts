import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
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
    checkinToken: text('checkin_token').unique(),
    registeredAt: timestamp('registered_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('registrations_user_workshop_idx').on(
      table.userUid,
      table.workshopId
    )
  ]
);

export const waitlist = pgTable(
  'waitlist',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    workshopId: integer('workshop_id')
      .references(() => workshops.id, { onDelete: 'cascade' })
      .notNull(),
    fullName: text('full_name').notNull(),
    age: integer('age').notNull(),
    gender: text('gender').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull(),
    address: text('address').notNull(),
    status: text('status').notNull().default('waiting'),
    notifiedAt: timestamp('notified_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('waitlist_user_workshop_idx').on(
      table.userUid,
      table.workshopId
    )
  ]
);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid')
    .references(() => users.uid, { onDelete: 'cascade' })
    .notNull(),
  workshopId: integer('workshop_id').references(() => workshops.id, {
    onDelete: 'cascade'
  }),
  type: text('type').notNull().default('waitlist_seat'),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

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

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  iconKey: text('icon_key').notNull().default('book'),
  description: text('description').notNull().default(''),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const institutions = pgTable('institutions', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  logoUrl: text('logo_url').notNull().default(''),
  imageUrl: text('image_url').notNull().default(''),
  phone: text('phone').notNull().default(''),
  website: text('website').notNull().default(''),
  trainingMode: text('training_mode').notNull().default('Offline'),
  description: text('description').notNull().default(''),
  isVerified: boolean('is_verified').notNull().default(false),
  placeId: text('place_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const institutionLocations = pgTable('institution_locations', {
  id: serial('id').primaryKey(),
  institutionId: integer('institution_id')
    .references(() => institutions.id, { onDelete: 'cascade' })
    .notNull(),
  address: text('address').notNull(),
  city: text('city').notNull(),
  area: text('area').notNull().default(''),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  googleMapsUrl: text('google_maps_url').notNull().default(''),
  isPrimary: boolean('is_primary').notNull().default(true)
});

export const institutionCourses = pgTable(
  'institution_courses',
  {
    id: serial('id').primaryKey(),
    institutionId: integer('institution_id')
      .references(() => institutions.id, { onDelete: 'cascade' })
      .notNull(),
    courseId: integer('course_id')
      .references(() => courses.id, { onDelete: 'cascade' })
      .notNull(),
    duration: text('duration').notNull().default(''),
    trainingMode: text('training_mode')
  },
  (table) => [
    uniqueIndex('institution_courses_inst_course_idx').on(
      table.institutionId,
      table.courseId
    )
  ]
);

export const coursesRelations = relations(courses, ({ many }) => ({
  institutionCourses: many(institutionCourses)
}));

export const institutionsRelations = relations(institutions, ({ many }) => ({
  locations: many(institutionLocations),
  institutionCourses: many(institutionCourses)
}));

export const institutionLocationsRelations = relations(
  institutionLocations,
  ({ one }) => ({
    institution: one(institutions, {
      fields: [institutionLocations.institutionId],
      references: [institutions.id]
    })
  })
);

export const institutionCoursesRelations = relations(
  institutionCourses,
  ({ one }) => ({
    institution: one(institutions, {
      fields: [institutionCourses.institutionId],
      references: [institutions.id]
    }),
    course: one(courses, {
      fields: [institutionCourses.courseId],
      references: [courses.id]
    })
  })
);

