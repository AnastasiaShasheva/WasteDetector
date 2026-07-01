// lib/api.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

import type {
    LoginResponse,
    RegisterResponse,
    SnapshotResponse,
    CreateSnapshotResponse,
    Snapshot,
    Session,
    SessionResponse,
    CreateSessionResponse,
    CleanupRequest,
    ApiError
} from './types';

class ApiClient {
    private baseURL: string;

    constructor() {
        this.baseURL = API_BASE_URL;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseURL}${endpoint}`;
        
        const defaultOptions: RequestInit = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const isFormData = options.body instanceof FormData;
        
        const mergedOptions: RequestInit = {
            ...defaultOptions,
            ...options,
            headers: {
                ...(isFormData ? {} : defaultOptions.headers),
                ...options.headers,
            },
        };

        try {
            const response = await fetch(url, mergedOptions);
            
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response:', text.substring(0, 200));
                throw new Error('Сервер вернул невалидный ответ');
            }
            
            const data = await response.json();

            if (!response.ok) {
                const error = data as ApiError;
                throw new Error(error.error || error.message || 'Ошибка запроса');
            }

            return data as T;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    // ========== Аутентификация ==========
    async login(login: string, password: string): Promise<LoginResponse> {
        return this.request<LoginResponse>('/login/', {
            method: 'POST',
            body: JSON.stringify({ login, password }),
        });
    }

    async register(login: string, email: string, password: string): Promise<RegisterResponse> {
        return this.request<RegisterResponse>('/register/', {
            method: 'POST',
            body: JSON.stringify({ login, email, password }),
        });
    }

    // ========== Снимки (Snapshots) ==========
    async createSnapshot(
        images: File[],
        userId?: number,
        sessionIdFk?: number
    ): Promise<CreateSnapshotResponse> {
        const formData = new FormData();
        
        images.forEach(image => {
            formData.append('images', image);
        });
        
        if (userId) formData.append('user_id', userId.toString());
        if (sessionIdFk) formData.append('session_id_fk', sessionIdFk.toString());

        return this.request<CreateSnapshotResponse>('/detect/', {
            method: 'POST',
            body: formData,
        });
    }

    async getSnapshots(params?: {
        session_id_fk?: number;
        limit?: number;
        offset?: number;
    }): Promise<SnapshotResponse> {
        const queryString = new URLSearchParams();
        
        if (params?.session_id_fk) queryString.append('session_id_fk', params.session_id_fk.toString());
        if (params?.limit) queryString.append('limit', params.limit.toString());
        if (params?.offset) queryString.append('offset', params.offset.toString());
        
        const query = queryString.toString();
        return this.request<SnapshotResponse>(`/snapshots/${query ? `?${query}` : ''}`);
    }

    async getSnapshotById(id: number): Promise<Snapshot> {
        return this.request<Snapshot>(`/snapshots/${id}/`);
    }

    // ========== Сессии (Sessions) ==========
    async createSession(
        userId: number,
        title: string,
        privacy: 'public' | 'private' = 'private'
    ): Promise<CreateSessionResponse> {
        return this.request<CreateSessionResponse>('/sessions/create/', {
            method: 'POST',
            body: JSON.stringify({
                user_id: userId,
                title,
                privacy: privacy,
            }),
        });
    }

    async getSessions(params?: {
        user_id?: number;
        limit?: number;
        offset?: number;
    }): Promise<SessionResponse> {
        const queryString = new URLSearchParams();
        
        if (params?.user_id) queryString.append('user_id', params.user_id.toString());
        if (params?.limit) queryString.append('limit', params.limit.toString());
        if (params?.offset) queryString.append('offset', params.offset.toString());
        
        const query = queryString.toString();
        return this.request<SessionResponse>(`/sessions/${query ? `?${query}` : ''}`);
    }

    // ИСПРАВЛЕНО: используем /detail/ для GET запроса
    async getSessionById(sessionId: number): Promise<Session> {
        return this.request<Session>(`/sessions/${sessionId}/detail/`);
    }

    async updateSessionCleanupStatus(
        sessionId: number, 
        userId: number, 
        cleanupStatus: 'cleaned' | 'pending'
    ): Promise<{ session_id: number; cleanup_status: string; message: string }> {
        return this.request(`/sessions/${sessionId}/cleanup/`, {
            method: 'PATCH',
            body: JSON.stringify({ user_id: userId, cleanup_status: cleanupStatus }),
        });
    }

    async deleteSession(sessionId: number, userId: number): Promise<{ message: string }> {
        return this.request(`/sessions/${sessionId}/delete/`, {
            method: 'DELETE',
            body: JSON.stringify({ user_id: userId }),
        });
    }

    async requestSessionCleanup(
        sessionId: number,
        userId: number,
        comment: string,
        photos: File[]
        ): Promise<{ request_id: number; session_id: number; message: string }> {
        const formData = new FormData();
        formData.append('user_id', userId.toString());
        if (comment) formData.append('comment', comment);
        
        // ВАЖНО: имя поля должно совпадать с тем, что ожидает бэкенд
        photos.forEach(photo => {
            formData.append('verification_photos', photo);
        });

        return this.request(`/sessions/${sessionId}/request-cleanup/`, {
            method: 'POST',
            body: formData,
        });
        }

    async getPublicSessions(params?: { limit?: number; offset?: number }): Promise<{ sessions: Session[]; count: number; limit: number; offset: number }> {
        const queryString = new URLSearchParams();
        if (params?.limit) queryString.append('limit', params.limit.toString());
        if (params?.offset) queryString.append('offset', params.offset.toString());
        
        const query = queryString.toString();
        return this.request(`/public-sessions/${query ? `?${query}` : ''}`);
    }

    async getPublicSessionsMap(): Promise<{ snapshots: { session_id: number; title: string; snapshot_id: number; lat: number; lon: number; waste_count: number }[] }> {
        return this.request('/public-sessions-map/');
    }

    // ========== Проверка пользователя ==========
    async checkUserActive(userId: number): Promise<{ is_active: boolean }> {
        return this.request(`/check-user/${userId}/`);
    }

    // ========== Админские методы ==========
    async getAdminUsers(adminId: number): Promise<{ users: any[] }> {
        return this.request(`/admin/users/?admin_id=${adminId}`);
    }

    async getAdminStats(): Promise<{
        total_users: number;
        total_sessions: number;
        total_snapshots: number;
        total_waste: number;
        pending_requests: number;
    }> {
        return this.request('/admin/stats/');
    }

    async updateUserRole(adminId: number, userId: number, role: 'user' | 'moderator' | 'admin'): Promise<{ message: string }> {
        return this.request(`/admin/users/${userId}/role/`, {
            method: 'PATCH',
            body: JSON.stringify({ admin_id: adminId, role }),
        });
    }

    async toggleUserBlock(adminId: number, userId: number, reason?: string): Promise<{ message: string; is_active: boolean }> {
        return this.request(`/admin/users/${userId}/toggle/`, {
            method: 'PATCH',
            body: JSON.stringify({ admin_id: adminId, reason: reason || '' }),
        });
    }
}

// Экспортируем экземпляр класса
export const api = new ApiClient();

// Также экспортируем сам класс на случай если нужен будет новый экземпляр
export { ApiClient };