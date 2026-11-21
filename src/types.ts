export type GenderOption = 'Female' | 'Male' | 'Other' | 'Prefer not to say';
export type WorkshopStatus = 'open' | 'closed' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent';
export type WaitlistStatus = 'waiting' | 'notified' | 'confirmed' | 'cancelled';

export const BLUEPRINT_LIMITS = {
  fullNameMin: 2,
  fullNameMax: 120,
  ageMin: 10,
  ageMax: 100,
  phoneMin: 5,
  phoneMax: 32,
  emailMax: 160,
  addressMin: 3,
  addressMax: 300,
  workshopNameMin: 2,
  workshopNameMax: 140,
  categoryMin: 2,
  categoryMax: 80,
  descriptionMin: 5,
  descriptionMax: 1000,
  durationMin: 1,
  durationMax: 60,
  locationMin: 2,
  locationMax: 160,
  commentsMax: 1000
} as const;

export interface Workshop {
  id: number;
  name: string;
  category: string;
  description: string;
  duration: string;
  workshopDate: string;
  startTime: string;
  capacity: number;
  registeredCount: number;
  waitlistCount?: number;
  location: string;
  status: WorkshopStatus;
  createdAt?: string;
}

export interface SessionRecord {
  id: number;
  workshopId: number;
  workshopName: string;
  sessionDate: string;
  startTime: string;
  qrToken: string;
}

export interface UserProfile {
  id: number;
  uid: string;
  email: string;
  role: string;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
}

export interface Registration {
  id: number;
  userUid?: string;
  participantName?: string;
  email?: string;
  workshopId: number;
  workshopName: string;
  status: 'confirmed' | 'cancelled';
  checkinToken?: string | null;
  registeredAt: string;
}

export interface WaitlistEntry {
  id: number;
  userUid?: string;
  workshopId: number;
  workshopName: string;
  fullName?: string;
  email?: string;
  phone?: string;
  status: WaitlistStatus;
  position?: number | null;
  notifiedAt?: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: number;
  userUid: string;
  workshopId: number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AttendanceRecord {
  id: number;
  registrationId: number;
  sessionId: number;
  status: AttendanceStatus;
  markedAt: string;
}

export interface FeedbackRecord {
  id: number;
  userUid: string;
  authorName: string;
  workshopId: number;
  workshopName: string;
  rating: number;
  comments: string;
  createdAt: string;
}

export interface CertificateRecord {
  id: number;
  userUid?: string;
  participantName?: string;
  email?: string;
  workshopId?: number;
  workshopName: string;
  certificateCode: string;
  issuedAt: string;
}

export interface WorkshopAnalyticsItem {
  id: number;
  name: string;
  category: string;
  status: WorkshopStatus;
  workshopDate: string;
  capacity: number;
  registeredCount: number;
  waitlistCount: number;
  fillRate: number;
  presentCount: number;
  absentCount: number;
  certifiedCount: number;
  completionRate: number;
}

export interface CategoryStat {
  category: string;
  workshops: number;
  registrations: number;
  certified: number;
}

export interface AdminAnalyticsSummary {
  totalParticipants: number;
  totalWorkshops: number;
  totalRegistrations: number;
  totalWaitlisted: number;
  presentCount: number;
  absentCount: number;
  attendanceRate: number;
  totalCertificates: number;
  popularWorkshops: WorkshopAnalyticsItem[];
  categoryStats: CategoryStat[];
}

export type TrainingMode = 'Online' | 'Offline' | 'Hybrid';

export interface CourseCategory {
  id: number;
  slug: string;
  name: string;
  iconKey: string;
  description: string;
  displayOrder: number;
  institutionCount: number;
}

export interface InstitutionLocationRecord {
  id: number;
  institutionId: number;
  address: string;
  city: string;
  area: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  isPrimary: boolean;
}

export interface InstitutionCourseOffering {
  id: number;
  institutionId: number;
  courseId: number;
  courseSlug: string;
  courseName: string;
  duration: string;
  trainingMode: string | null;
}

export interface TrainingInstitution {
  id: number;
  name: string;
  logoUrl: string;
  imageUrl: string;
  phone: string;
  website: string;
  trainingMode: TrainingMode;
  description: string;
  isVerified: boolean;
  placeId: string | null;
  createdAt: string;
  updatedAt: string;
  locations: InstitutionLocationRecord[];
  courses: InstitutionCourseOffering[];
  distanceKm?: number | null;
}

export interface InstitutionCourseInput {
  courseId: number;
  duration: string;
  trainingMode?: TrainingMode | null;
}

export interface InstitutionInputPayload {
  name: string;
  logoUrl?: string;
  imageUrl?: string;
  phone?: string;
  website?: string;
  trainingMode: TrainingMode;
  description: string;
  isVerified?: boolean;
  placeId?: string | null;
  address: string;
  city: string;
  area?: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  courses: InstitutionCourseInput[];
}

export interface VerifiedPlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  area: string;
  phone: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
}

