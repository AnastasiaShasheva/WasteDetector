// lib/types.ts

export type UserRole = 'user' | 'moderator' | 'admin';

export type SessionCleanupStatus = 'pending' | 'cleaned';

export type CleanupRequestStatus = 'pending' | 'approved' | 'rejected';

export interface User {
    id: number;
    login: string;
    email: string;
    role: UserRole;
    is_active?: boolean;
}

export interface LoginResponse {
    user_id: number;
    login: string;
    email: string;
    role: UserRole;
    message: string;
}

export interface RegisterResponse {
    id: number;
    login: string;
    email: string;
    role: UserRole;
}

// ========== Снимки (Snapshots) ==========
export interface Snapshot {
    id: number;
    filename: string;
    original_image_path: string;
    result_image_path: string | null;
    waste_count: number;
    session_id_fk: number | null;
    latitude: number | null;
    longitude: number | null;
}

export interface SnapshotResponse {
    snapshots: Snapshot[];
    count: number;
    limit: number;
    offset: number;
}

export interface CreateSnapshotResponse {
    session_id_fk: number;
    results: {
        snapshot_id: number;
        filename: string;
        original_url: string;
        result_url: string | null;
        waste_count: number;
        has_gps: boolean;
        latitude: number | null;
        longitude: number | null;
    }[];
    total_snapshots: number;
}

// ========== Сессии (Sessions) ==========
export interface Session {
    id: number;
    user_id: number;
    user_login?: string;
    title: string;
    session_uuid?: string;
    privacy: 'public' | 'private';
    created_at: string;
    cleanup_status: SessionCleanupStatus;
    snapshots?: Snapshot[];
    total_snapshots?: number;
    total_waste_count?: number;
    cover_image?: string | null;
}

export interface SessionResponse {
    sessions: Session[];
    count: number;
    limit: number;
    offset: number;
}

export interface CreateSessionResponse {
    id: number;           // ID созданной сессии
    session_uuid: string;
    privacy: string;
    cleanup_status: string;
    message: string;
}

// ========== Запросы на очистку ==========
export interface CleanupRequest {
    id: number;
    session_id: number;
    session_title: string;
    requester_user_id: number;
    requester_login: string;
    status: CleanupRequestStatus;
    verification_photos: string[];
    comment: string;
    created_at: string;
    resolved_at: string | null;
    resolution_comment: string | null;
}

// ========== Ошибки ==========
export interface ApiError {
    error: string;
    message?: string;
}

interface SnapshotResult {
  snapshot_id: number;
  filename: string;
  original_url: string;
  result_url: string | null;
  waste_count: number;
  has_gps: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  status: string;
  session_id_fk?: number;  // Добавьте эту строку
}