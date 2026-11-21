export type GenderOption = 'Female' | 'Male' | 'Other' | 'Prefer not to say';
export type WorkshopStatus = 'open' | 'closed' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent';

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
  registeredAt: string;
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
