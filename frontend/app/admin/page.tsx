'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

import { 
  HiCheck, 
  HiX, 
  HiTrash, 
  HiCamera,
} from 'react-icons/hi';

interface User {
  id: number;
  login: string;
  email: string;
  role: 'user' | 'moderator' | 'admin' | 'banned';
  is_active: boolean;
  avatar?: string;
  total_snapshots?: number;
  total_waste_items?: number;
  total_sessions?: number;
  created_at?: string;
}

interface Session {
  id: number;
  user_id: number;
  user_login?: string;
  title: string;
  description?: string;
  privacy: 'public' | 'private' | 'unlisted';
  cleanup_status: 'pending' | 'cleaned';
  total_waste_count: number;
  total_snapshots: number;
  locations_count: number;
  created_at: string;
  status: string;
}

interface CleanupRequest {
  id: number;
  session_id: number;
  session_title: string;
  requester_user_id: number;
  requester_login: string;
  status: 'pending' | 'approved' | 'rejected';
  comment: string;
  verification_photos: string[];  // Это поле должно быть
  created_at: string;
  resolved_at?: string;
}

interface Report {
  id: number;
  session_id: number;
  session_title: string;
  session_owner_id: number;
  session_owner_login: string;
  reporter_user_id: number;
  reporter_login: string;
  reason: string;
  comment: string;
  status: 'pending' | 'resolved' | 'rejected';
  created_at: string;
  resolved_at: string | null;
  resolution_comment: string | null;
  resolved_by_login: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE_URL = 'http://localhost:8000';

type TabType = 'users' | 'sessions' | 'requests' | 'reports';

type UserSortField = 'id' | 'login' | 'email' | 'role' | 'is_active' | 'total_sessions' | 'total_snapshots' | 'total_waste_items';
type SessionSortField = 'id' | 'title' | 'user_login' | 'total_snapshots' | 'total_waste_count' | 'cleanup_status' | 'created_at';
type RequestSortField = 'id' | 'requester_login' | 'status' | 'created_at';
type ReportSortField = 'id' | 'session_title' | 'session_owner_login' | 'reporter_login' | 'reason' | 'status' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function AdminPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('sessions');
  const [mounted, setMounted] = useState(false);
  
  // Данные
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [requests, setRequests] = useState<CleanupRequest[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState({
    total_users: 0,
    total_sessions: 0,
    total_snapshots: 0,
    total_waste: 0,
    pending_requests: 0,
    pending_reports: 0
  });
  
  // Состояния для модального окна с фото
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  
  // Фильтры для отчетов
  const [reportSearch, setReportSearch] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState('all');
  const [reportSortField, setReportSortField] = useState<ReportSortField>('created_at');
  const [reportSortOrder, setReportSortOrder] = useState<SortOrder>('desc');
  
  // Фильтры и сортировка для сессий
  const [sessionSearch, setSessionSearch] = useState('');
  const [sessionFilterUser, setSessionFilterUser] = useState('');
  const [sessionUserSearch, setSessionUserSearch] = useState('');
  const [sessionFilterCleanup, setSessionFilterCleanup] = useState('all');
  const [sessionFilterPrivacy, setSessionFilterPrivacy] = useState('all');
  const [sessionSortField, setSessionSortField] = useState<SessionSortField>('created_at');
  const [sessionSortOrder, setSessionSortOrder] = useState<SortOrder>('desc');
  const [sessionDateFrom, setSessionDateFrom] = useState('');
  const [sessionDateTo, setSessionDateTo] = useState('');
  const [showSessionUserDropdown, setShowSessionUserDropdown] = useState(false);
  
  // Фильтры и сортировка для заявок
  const [requestSearch, setRequestSearch] = useState('');
  const [requestFilterUser, setRequestFilterUser] = useState('');
  const [requestUserSearch, setRequestUserSearch] = useState('');
  const [requestFilterStatus, setRequestFilterStatus] = useState('all');
  const [requestSortField, setRequestSortField] = useState<RequestSortField>('created_at');
  const [requestSortOrder, setRequestSortOrder] = useState<SortOrder>('desc');
  const [showRequestUserDropdown, setShowRequestUserDropdown] = useState(false);
  
  // Фильтры и сортировка для пользователей
  const [userSearch, setUserSearch] = useState('');
  const [userFilterRole, setUserFilterRole] = useState('all');
  const [userFilterStatus, setUserFilterStatus] = useState('all');
  const [userSortField, setUserSortField] = useState<UserSortField>('id');
  const [userSortOrder, setUserSortOrder] = useState<SortOrder>('asc');
  
  // Состояния UI
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  const [updatingCleanupId, setUpdatingCleanupId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Проверка авторизации и установка currentUser
  useEffect(() => {
    if (!mounted) return;
    
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(storedUser);
      if (user.role !== 'admin') {
        router.push('/');
        return;
      }
      setCurrentUser(user);
    } catch (e) {
      router.push('/login');
    }
  }, [mounted, router]);

  // Загрузка данных после установки currentUser
  useEffect(() => {
    if (currentUser) {
      loadData();
    }
  }, [currentUser]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = async () => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    try {
      await Promise.all([
        loadUsers(),
        loadAllSessions(),
        loadCleanupRequests(),
        loadReports(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/?admin_id=${currentUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки пользователей:', error);
    }
  };

  const loadAllSessions = async () => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sessions/?admin_id=${currentUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки сессий:', error);
    }
  };

  const loadCleanupRequests = async () => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/cleanup-requests/?admin_id=${currentUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Ошибка загрузки заявок:', error);
    }
  };

  const loadReports = async () => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/reports/?admin_id=${currentUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setReports(data.reports || []);
        setStats(prev => ({ ...prev, pending_reports: data.pending_count || 0 }));
      }
    } catch (error) {
      console.error('Ошибка загрузки жалоб:', error);
    }
  };

  const loadStats = async () => {
    if (!currentUser?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/admin/stats/?admin_id=${currentUser.id}`);
      if (response.ok) {
        const data = await response.json();
        setStats(prev => ({ ...prev, ...data }));
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики:', error);
    }
  };

  const updateUserRole = async (userId: number, newRole: 'user' | 'moderator' | 'admin' | 'banned') => {
    setUpdatingId(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/role/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole, admin_id: currentUser?.id })
      });

      if (response.ok) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, role: newRole } : u
        ));
        const message = newRole === 'banned' ? 'Пользователь заблокирован' : `Роль изменена на ${newRole}`;
        showNotification(message, 'success');
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка обновления роли', 'error');
      }
    } catch (error) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleUserBan = async (userId: number, currentRole: string) => {
    const isBanned = currentRole === 'banned';
    const newRole = isBanned ? 'user' : 'banned';
    const action = isBanned ? 'разблокирован' : 'заблокирован';
    
    if (!confirm(`Вы уверены, что хотите ${action} этого пользователя?`)) return;
    
    setUpdatingId(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/role/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          role: newRole, 
          admin_id: currentUser?.id 
        })
      });

      if (response.ok) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, role: newRole as any } : u
        ));
        showNotification(`Пользователь ${action}`, 'success');
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка', 'error');
      }
    } catch (error) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleUserActive = async (userId: number, isActive: boolean) => {
    setUpdatingId(userId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/toggle/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive, admin_id: currentUser?.id })
      });

      if (response.ok) {
        setUsers(prev => prev.map(u => 
          u.id === userId ? { ...u, is_active: !isActive } : u
        ));
        showNotification(`Пользователь ${!isActive ? 'активирован' : 'деактивирован'}`, 'success');
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка изменения статуса', 'error');
      }
    } catch (error) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const updateSessionCleanupStatus = async (sessionId: number, newStatus: 'cleaned' | 'pending') => {
    setUpdatingCleanupId(sessionId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sessions/${sessionId}/cleanup/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          admin_id: currentUser?.id,
          cleanup_status: newStatus 
        })
      });

      if (response.ok) {
        setSessions(prev => prev.map(s => 
          s.id === sessionId ? { ...s, cleanup_status: newStatus } : s
        ));
        showNotification(`Статус очистки изменен на ${newStatus === 'cleaned' ? 'очищена' : 'требует уборки'}`, 'success');
        loadStats();
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка изменения статуса', 'error');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingCleanupId(null);
    }
  };

  const deleteSession = async (sessionId: number) => {
    if (!confirm('Удалить эту сессию? Действие необратимо.')) return;
    
    setUpdatingId(sessionId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/sessions/${sessionId}/delete/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_id: currentUser?.id })
      });

      if (response.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        showNotification('Сессия удалена', 'success');
        loadStats();
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка удаления', 'error');
      }
    } catch (error) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const resolveCleanupRequest = async (requestId: number, action: 'approve' | 'reject') => {
    setUpdatingId(requestId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/cleanup-requests/${requestId}/resolve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, admin_id: currentUser?.id })
      });

      if (response.ok) {
        setRequests(prev => prev.map(r => 
          r.id === requestId 
            ? { ...r, status: action === 'approve' ? 'approved' : 'rejected' }
            : r
        ));
        
        if (action === 'approve') {
          const request = requests.find(r => r.id === requestId);
          if (request) {
            setSessions(prev => prev.map(s => 
              s.id === request.session_id ? { ...s, cleanup_status: 'cleaned' } : s
            ));
          }
        }
        
        showNotification(`Заявка ${action === 'approve' ? 'одобрена' : 'отклонена'}`, 'success');
        loadStats();
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка обработки заявки', 'error');
      }
    } catch (error) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const openSession = (sessionId: number) => {
    router.push(`/sessions/${sessionId}`);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getReasonText = (reason: string) => {
    switch (reason) {
      case 'spam': return 'Спам';
      case 'inappropriate': return 'Неприемлемое содержание';
      case 'fake': return 'Фальшивая информация';
      case 'other': return 'Другое';
      default: return reason;
    }
  };

  const getReasonClass = (reason: string) => {
    switch (reason) {
      case 'spam': return styles.reasonSpam;
      case 'inappropriate': return styles.reasonInappropriate;
      case 'fake': return styles.reasonFake;
      case 'other': return styles.reasonOther;
      default: return styles.reasonOther;
    }
  };

  const getReportStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return styles.statusPending;
      case 'resolved': return styles.statusResolved;
      case 'rejected': return styles.statusRejected;
      default: return '';
    }
  };

  const getReportStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидает';
      case 'resolved': return 'Удалена';
      case 'rejected': return 'Отклонена';
      default: return status;
    }
  };

  // Фильтрация и сортировка пользователей
  const filteredUsers = useMemo(() => {
    let filtered = [...users];
    
    if (userSearch) {
      filtered = filtered.filter(u => 
        u.login.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase())
      );
    }
    
    if (userFilterRole !== 'all') {
      filtered = filtered.filter(u => u.role === userFilterRole);
    }
    
    if (userFilterStatus !== 'all') {
      filtered = filtered.filter(u => u.is_active === (userFilterStatus === 'active'));
    }
    
    filtered.sort((a, b) => {
      let aVal: any = a[userSortField];
      let bVal: any = b[userSortField];
      
      if (userSortField === 'is_active') {
        aVal = aVal ? 1 : 0;
        bVal = bVal ? 1 : 0;
      }
      
      if (userSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [users, userSearch, userFilterRole, userFilterStatus, userSortField, userSortOrder]);

  // Фильтрация и сортировка сессий
  const filteredSessions = useMemo(() => {
    let filtered = [...sessions];
    
    if (sessionSearch) {
      filtered = filtered.filter(s => 
        s.title.toLowerCase().includes(sessionSearch.toLowerCase())
      );
    }
    
    if (sessionFilterUser) {
      filtered = filtered.filter(s => 
        s.user_login?.toLowerCase().includes(sessionFilterUser.toLowerCase())
      );
    }
    
    if (sessionFilterCleanup !== 'all') {
      filtered = filtered.filter(s => s.cleanup_status === sessionFilterCleanup);
    }
    
    if (sessionFilterPrivacy !== 'all') {
      filtered = filtered.filter(s => s.privacy === sessionFilterPrivacy);
    }
    
    if (sessionDateFrom) {
      filtered = filtered.filter(s => s.created_at >= sessionDateFrom);
    }
    if (sessionDateTo) {
      const endDate = new Date(sessionDateTo);
      endDate.setHours(23, 59, 59);
      filtered = filtered.filter(s => new Date(s.created_at) <= endDate);
    }
    
    filtered.sort((a, b) => {
      let aVal: any = a[sessionSortField];
      let bVal: any = b[sessionSortField];
      
      if (sessionSortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (sessionSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [sessions, sessionSearch, sessionFilterUser, sessionFilterCleanup, sessionFilterPrivacy, sessionDateFrom, sessionDateTo, sessionSortField, sessionSortOrder]);

  // Фильтрация и сортировка заявок
  const filteredRequests = useMemo(() => {
    let filtered = [...requests];
    
    if (requestSearch) {
      filtered = filtered.filter(r => 
        r.session_title.toLowerCase().includes(requestSearch.toLowerCase()) ||
        r.requester_login.toLowerCase().includes(requestSearch.toLowerCase())
      );
    }
    
    if (requestFilterUser) {
      filtered = filtered.filter(r => 
        r.requester_login.toLowerCase().includes(requestFilterUser.toLowerCase())
      );
    }
    
    if (requestFilterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === requestFilterStatus);
    }
    
    filtered.sort((a, b) => {
      let aVal: any = a[requestSortField];
      let bVal: any = b[requestSortField];
      
      if (requestSortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (requestSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [requests, requestSearch, requestFilterUser, requestFilterStatus, requestSortField, requestSortOrder]);

  // Фильтрация и сортировка жалоб
  const filteredReports = useMemo(() => {
    let filtered = [...reports];
    
    if (reportSearch) {
      filtered = filtered.filter(r => 
        r.session_title.toLowerCase().includes(reportSearch.toLowerCase()) ||
        r.session_owner_login.toLowerCase().includes(reportSearch.toLowerCase()) ||
        r.reporter_login.toLowerCase().includes(reportSearch.toLowerCase())
      );
    }
    
    if (reportFilterStatus !== 'all') {
      filtered = filtered.filter(r => r.status === reportFilterStatus);
    }
    
    filtered.sort((a, b) => {
      let aVal: any = a[reportSortField];
      let bVal: any = b[reportSortField];
      
      if (reportSortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (reportSortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    
    return filtered;
  }, [reports, reportSearch, reportFilterStatus, reportSortField, reportSortOrder]);

  // Уникальные пользователи для фильтра
  const sessionUniqueUsers = useMemo(() => {
    const usersMap = new Map();
    sessions.forEach(s => {
      if (s.user_login && !usersMap.has(s.user_login)) {
        usersMap.set(s.user_login, s.user_login);
      }
    });
    let usersList = Array.from(usersMap.values());
    if (sessionUserSearch) {
      usersList = usersList.filter(u => u.toLowerCase().includes(sessionUserSearch.toLowerCase()));
    }
    return usersList;
  }, [sessions, sessionUserSearch]);

  const requestUniqueUsers = useMemo(() => {
    const usersMap = new Map();
    requests.forEach(r => {
      if (!usersMap.has(r.requester_login)) {
        usersMap.set(r.requester_login, r.requester_login);
      }
    });
    let usersList = Array.from(usersMap.values());
    if (requestUserSearch) {
      usersList = usersList.filter(u => u.toLowerCase().includes(requestUserSearch.toLowerCase()));
    }
    return usersList;
  }, [requests, requestUserSearch]);

  const handleUserSort = (field: UserSortField) => {
    if (userSortField === field) {
      setUserSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setUserSortField(field);
      setUserSortOrder('asc');
    }
  };

  const handleSessionSort = (field: SessionSortField) => {
    if (sessionSortField === field) {
      setSessionSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSessionSortField(field);
      setSessionSortOrder('desc');
    }
  };

  const handleRequestSort = (field: RequestSortField) => {
    if (requestSortField === field) {
      setRequestSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setRequestSortField(field);
      setRequestSortOrder('desc');
    }
  };

  const handleReportSort = (field: ReportSortField) => {
    if (reportSortField === field) {
      setReportSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setReportSortField(field);
      setReportSortOrder('desc');
    }
  };

  if (!mounted || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>{!mounted ? 'Загрузка...' : 'Загрузка панели управления...'}</p>
      </div>
    );
  }

  return (
    <>
    <head>
      <title>Админ панель</title>
    </head>
    <main className={styles.main}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.container}>
        {/* Табы */}
        <div className={styles.tabs}>
          <button
            onClick={() => setActiveTab('sessions')}
            className={`${styles.tabBtn} ${activeTab === 'sessions' ? styles.tabActive : ''}`}
          >
            Сессии ({filteredSessions.length})
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`${styles.tabBtn} ${activeTab === 'users' ? styles.tabActive : ''}`}
          >
            Пользователи ({filteredUsers.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`${styles.tabBtn} ${activeTab === 'requests' ? styles.tabActive : ''}`}
          >
            Заявки ({filteredRequests.filter(r => r.status === 'pending').length})
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`${styles.tabBtn} ${activeTab === 'reports' ? styles.tabActive : ''}`}
          >
            Жалобы ({filteredReports.filter(r => r.status === 'pending').length})
          </button>
        </div>

        {/* СЕССИИ */}
        {activeTab === 'sessions' && (
          <>
            <div className={styles.filtersBar}>
              <div className={styles.filterGroup}>
                <input
                  type="text"
                  placeholder="Поиск по названию..."
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className={styles.filterInput}
                />
              </div>
              <div className={styles.filterGroup}>
                <div className={styles.searchableDropdown}>
                  <input
                    type="text"
                    placeholder="Пользователь..."
                    value={sessionFilterUser}
                    onChange={(e) => {
                      setSessionFilterUser(e.target.value);
                      setSessionUserSearch(e.target.value);
                      setShowSessionUserDropdown(true);
                    }}
                    onFocus={() => setShowSessionUserDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSessionUserDropdown(false), 200)}
                    className={styles.filterInput}
                  />
                  {showSessionUserDropdown && sessionUniqueUsers.length > 0 && (
                    <div className={styles.dropdownList}>
                      {sessionUniqueUsers.map(user => (
                        <div
                          key={user}
                          className={styles.dropdownItem}
                          onClick={() => {
                            setSessionFilterUser(user);
                            setSessionUserSearch(user);
                            setShowSessionUserDropdown(false);
                          }}
                        >
                          {user}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.filterGroup}>
                <select
                  value={sessionFilterCleanup}
                  onChange={(e) => setSessionFilterCleanup(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">Все статусы</option>
                  <option value="pending">⚠️ Требует уборки</option>
                  <option value="cleaned">✅ Очищена</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <select
                  value={sessionFilterPrivacy}
                  onChange={(e) => setSessionFilterPrivacy(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">Все</option>
                  <option value="public">Публичная</option>
                  <option value="private">Приватная</option>
                  <option value="unlisted">Непубличная</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <input
                  type="date"
                  placeholder="Дата от"
                  value={sessionDateFrom}
                  onChange={(e) => setSessionDateFrom(e.target.value)}
                  className={styles.filterInput}
                />
              </div>
              <div className={styles.filterGroup}>
                <input
                  type="date"
                  placeholder="Дата до"
                  value={sessionDateTo}
                  onChange={(e) => setSessionDateTo(e.target.value)}
                  className={styles.filterInput}
                />
              </div>
              <button
                onClick={() => {
                  setSessionSearch('');
                  setSessionFilterUser('');
                  setSessionUserSearch('');
                  setSessionFilterCleanup('all');
                  setSessionFilterPrivacy('all');
                  setSessionDateFrom('');
                  setSessionDateTo('');
                }}
                className={styles.resetBtn}
              >
                Сбросить
              </button>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th onClick={() => handleSessionSort('title')} className={styles.sortable}>
                      Название {sessionSortField === 'title' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSessionSort('user_login')} className={styles.sortable}>
                      Пользователь {sessionSortField === 'user_login' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSessionSort('total_snapshots')} className={styles.sortable}>
                      Фото {sessionSortField === 'total_snapshots' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSessionSort('total_waste_count')} className={styles.sortable}>
                      Мусора {sessionSortField === 'total_waste_count' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Приватность</th>
                    <th onClick={() => handleSessionSort('cleanup_status')} className={styles.sortable}>
                      Статус {sessionSortField === 'cleanup_status' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleSessionSort('created_at')} className={styles.sortable}>
                      Дата {sessionSortField === 'created_at' && (sessionSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSessions.map(session => (
                    <tr key={session.id} className={styles.clickableRow} onClick={() => openSession(session.id)}>
                      <td className={styles.sessionTitle}>{session.title}</td>
                      <td>{session.user_login || `ID: ${session.user_id}`}</td>
                      <td>{session.total_snapshots}</td>
                      <td>{session.total_waste_count}</td>
                      <td>
                        <span className={`${styles.privacyBadge} ${styles[session.privacy]}`}>
                          {session.privacy === 'public' ? '🌍 Публичная' : session.privacy === 'private' ? '🔒 Приватная' : '🔗 Непубличная'}
                        </span>
                      </td>
                      <td>
                        <select
                          value={session.cleanup_status}
                          onChange={(e) => updateSessionCleanupStatus(session.id, e.target.value as 'cleaned' | 'pending')}
                          disabled={updatingCleanupId === session.id}
                          className={`${styles.cleanupSelect} ${session.cleanup_status === 'cleaned' ? styles.cleanedStatus : styles.pendingStatus}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value="pending">⚠️ Требует уборки</option>
                          <option value="cleaned">✅ Очищена</option>
                        </select>
                      </td>
                      <td>{formatDate(session.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => deleteSession(session.id)}
                          disabled={updatingId === session.id}
                          className={styles.deleteBtn}
                          title="Удалить сессию"
                        >
                          <HiTrash size={26} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSessions.length === 0 && (
                <div className={styles.emptyState}>
                  <p>Нет сессий по выбранным фильтрам</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ПОЛЬЗОВАТЕЛИ */}
        {activeTab === 'users' && (
          <>
            <div className={styles.filtersBar}>
              <div className={styles.filterGroup}>
                <input
                  type="text"
                  placeholder="Поиск по логину..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className={styles.filterInput}
                />
              </div>
              <div className={styles.filterGroup}>
                <select
                  value={userFilterRole}
                  onChange={(e) => setUserFilterRole(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">Все роли</option>
                  <option value="user">Пользователь</option>
                  <option value="moderator">Модератор</option>
                  <option value="admin">Администратор</option>
                  <option value="banned">🔒 Забанен</option>
                </select>
              </div>
              <div className={styles.filterGroup}>
                <select
                  value={userFilterStatus}
                  onChange={(e) => setUserFilterStatus(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">Все статусы</option>
                  <option value="active">Активен</option>
                  <option value="inactive">Не активен</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setUserSearch('');
                  setUserFilterRole('all');
                  setUserFilterStatus('all');
                }}
                className={styles.resetBtn}
              >
                Сбросить
              </button>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th onClick={() => handleUserSort('login')} className={styles.sortable}>
                      Логин {userSortField === 'login' && (userSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleUserSort('email')} className={styles.sortable}>
                      Email {userSortField === 'email' && (userSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleUserSort('role')} className={styles.sortable}>
                      Роль {userSortField === 'role' && (userSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => (
                    <tr key={user.id}>
                      <td>{user.login}</td>
                      <td>{user.email}</td>
                      <td>
                        <select
                          value={user.role}
                          onChange={(e) => updateUserRole(user.id, e.target.value as any)}
                          disabled={updatingId === user.id || user.id === currentUser?.id}
                          className={`${styles.roleSelect} ${user.role === 'banned' ? styles.bannedRole : ''}`}
                        >
                          <option value="user">Пользователь</option>
                          <option value="moderator">Модератор</option>
                          <option value="admin">Администратор</option>
                          <option value="banned">🔒 Забанен</option>
                        </select>
                      </td>
                      <td>
                        {user.id !== currentUser?.id && (
                          <button
                            onClick={() => toggleUserBan(user.id, user.role)}
                            disabled={updatingId === user.id}
                            className={user.role === 'banned' ? styles.unbanBtn : styles.banBtn}
                          >
                            {user.role === 'banned' ? 'Разбанить' : 'Забанить'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredUsers.length === 0 && (
                <div className={styles.emptyState}>
                  <p>Нет пользователей по выбранным фильтрам</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* ЗАЯВКИ */}
{activeTab === 'requests' && (
  <>
    <div className={styles.filtersBar}>
      <div className={styles.filterGroup}>
        <input
          type="text"
          placeholder="Поиск по сессии"
          value={requestSearch}
          onChange={(e) => setRequestSearch(e.target.value)}
          className={styles.filterInput}
        />
      </div>
      <div className={styles.filterGroup}>
        <div className={styles.searchableDropdown}>
          <input
            type="text"
            placeholder="Автор..."
            value={requestFilterUser}
            onChange={(e) => {
              setRequestFilterUser(e.target.value);
              setRequestUserSearch(e.target.value);
              setShowRequestUserDropdown(true);
            }}
            onFocus={() => setShowRequestUserDropdown(true)}
            onBlur={() => setTimeout(() => setShowRequestUserDropdown(false), 200)}
            className={styles.filterInput}
          />
          {showRequestUserDropdown && requestUniqueUsers.length > 0 && (
            <div className={styles.dropdownList}>
              {requestUniqueUsers.map(user => (
                <div
                  key={user}
                  className={styles.dropdownItem}
                  onClick={() => {
                    setRequestFilterUser(user);
                    setRequestUserSearch(user);
                    setShowRequestUserDropdown(false);
                  }}
                >
                  {user}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <select
          value={requestFilterStatus}
          onChange={(e) => setRequestFilterStatus(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="all">Все статусы</option>
          <option value="pending">В обработке</option>
          <option value="approved">Одобрена</option>
          <option value="rejected">Отклонена</option>
        </select>
      </div>
      <button
        onClick={() => {
          setRequestSearch('');
          setRequestFilterUser('');
          setRequestUserSearch('');
          setRequestFilterStatus('all');
        }}
        className={styles.resetBtn}
      >
        Сбросить
      </button>
    </div>

    <div className={styles.tableContainer}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Сессия</th>
            <th onClick={() => handleRequestSort('requester_login')} className={styles.sortable}>
              Заявитель {requestSortField === 'requester_login' && (requestSortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th>Комментарий</th>
            <th>Фото</th>
            <th onClick={() => handleRequestSort('status')} className={styles.sortable}>
              Статус {requestSortField === 'status' && (requestSortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleRequestSort('created_at')} className={styles.sortable}>
              Дата {requestSortField === 'created_at' && (requestSortOrder === 'asc' ? '↑' : '↓')}
            </th>
            
          </tr>
        </thead>
        <tbody>
          {filteredRequests.map(request => (
            <tr key={request.id}>
              <td 
                className={styles.sessionLink}
                onClick={() => openSession(request.session_id)}
              >
                {request.session_title} ↗
              </td>
              <td>{request.requester_login}</td>
              <td className={styles.commentCell}>{request.comment || '—'}</td>
              <td>
                {request.verification_photos && request.verification_photos.length > 0 && (
                  <div className={styles.photoThumbs}>
                    {request.verification_photos.slice(0, 3).map((photo, idx) => (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPhotos(request.verification_photos);
                          setShowPhotoModal(true);
                        }}
                        className={styles.photoThumbBtn}
                        title={`Фото ${idx + 1}`}
                      >
                        <HiCamera size={20} />
                      </button>
                    ))}
                    {request.verification_photos.length > 3 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPhotos(request.verification_photos);
                          setShowPhotoModal(true);
                        }}
                        className={styles.photoThumbBtn}
                        title={`Еще ${request.verification_photos.length - 3} фото`}
                      >
                        +{request.verification_photos.length - 3}
                      </button>
                    )}
                  </div>
                )}
              </td>
              <td>
                <span className={`${styles.requestStatus} ${styles[request.status]}`}>
                  {request.status === 'pending' ? 'В обработке' : 
                   request.status === 'approved' ? 'Одобрена' : 'Отклонена'}
                </span>
              </td>
              <td>{formatDate(request.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filteredRequests.length === 0 && (
        <div className={styles.emptyState}>
          <p>Нет заявок по выбранным фильтрам</p>
        </div>
      )}
    </div>
  </>
)}

        {/* ЖАЛОБЫ */}
        {activeTab === 'reports' && (
          <>
            <div className={styles.filtersBar}>
              <div className={styles.filterGroup}>
                <input
                  type="text"
                  placeholder="Поиск по сессии или пользователю..."
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                  className={styles.filterInput}
                />
              </div>
              <div className={styles.filterGroup}>
                <select
                  value={reportFilterStatus}
                  onChange={(e) => setReportFilterStatus(e.target.value)}
                  className={styles.filterSelect}
                >
                  <option value="all">Все статусы</option>
                  <option value="pending">Ожидают</option>
                  <option value="resolved">Удалены</option>
                  <option value="rejected">Отклонены</option>
                </select>
              </div>
              <button
                onClick={() => {
                  setReportSearch('');
                  setReportFilterStatus('all');
                }}
                className={styles.resetBtn}
              >
                Сбросить
              </button>
            </div>

            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th onClick={() => handleReportSort('session_title')} className={styles.sortable}>
                      Сессия {reportSortField === 'session_title' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleReportSort('session_owner_login')} className={styles.sortable}>
                      Автор сессии {reportSortField === 'session_owner_login' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleReportSort('reporter_login')} className={styles.sortable}>
                      Пожаловался {reportSortField === 'reporter_login' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleReportSort('reason')} className={styles.sortable}>
                      Причина {reportSortField === 'reason' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th>Комментарий</th>
                    <th onClick={() => handleReportSort('created_at')} className={styles.sortable}>
                      Дата {reportSortField === 'created_at' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                    <th onClick={() => handleReportSort('status')} className={styles.sortable}>
                      Статус {reportSortField === 'status' && (reportSortOrder === 'asc' ? '↑' : '↓')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map(report => (
                    <tr key={report.id} className={styles.clickableRow} onClick={() => openSession(report.session_id)}>
                      <td className={styles.sessionTitle}>{report.session_title}</td>
                      <td>{report.session_owner_login}</td>
                      <td>{report.reporter_login}</td>
                      <td>
                        <span className={`${styles.reasonBadge} ${getReasonClass(report.reason)}`}>
                          {getReasonText(report.reason)}
                        </span>
                      </td>
                      <td className={styles.commentCell} title={report.comment || ''}>
                        {report.comment || '—'}
                      </td>
                      <td>{formatDate(report.created_at)}</td>
                      <td>
                        <span className={`${styles.reportStatus} ${getReportStatusClass(report.status)}`}>
                          {getReportStatusText(report.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredReports.length === 0 && (
                <div className={styles.emptyState}>
                  <p>Нет жалоб по выбранным фильтрам</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Модальное окно для просмотра фото */}
      {showPhotoModal && selectedPhotos.length > 0 && (
        <div className={styles.modalOverlay} onClick={() => setShowPhotoModal(false)}>
          <div className={styles.photoModalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Фото доказательства ({selectedPhotos.length})</h3>
              <button className={styles.modalClose} onClick={() => setShowPhotoModal(false)}>✕</button>
            </div>
            <div className={styles.photoModalBody}>
              <div className={styles.photoGrid}>
                {selectedPhotos.map((photo, idx) => (
                  <a
                    key={idx}
                    href={`${MEDIA_BASE_URL}${photo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.photoModalItem}
                  >
                    <div className={styles.photoWrapper}>
                      <HiCamera size={32} />
                      <span>Фото {idx + 1}</span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setShowPhotoModal(false)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}