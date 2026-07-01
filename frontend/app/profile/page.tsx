'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Session as ApiSession } from '@/lib/types';
import styles from './page.module.css';

interface User {
  id: number;
  login: string;
  email: string;
  role: string;
}

// Используем тип Session из API
type Session = ApiSession;

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE_URL = 'http://localhost:8000';

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [cleanedSessions, setCleanedSessions] = useState<Session[]>([]);
  const [cleanedStats, setCleanedStats] = useState({
    total_cleaned: 0,
    total_waste_cleaned: 0,
    cleaned_sessions_count: 0
  });
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'private' | 'public' | 'cleaned'>('private');
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) {
      router.push('/login');
      return;
    }

    try {
      const userData = JSON.parse(storedUser);
      setUser(userData);
      loadSessions(userData.id);
      loadCleanedSessions(userData.id);
      loadPendingRequestsCount(userData.id);
    } catch (e) {
      console.error('Ошибка парсинга user:', e);
      router.push('/login');
    }
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadSessions = async (userId: number) => {
    try {
      const response = await api.getSessions({ user_id: userId });
      setAllSessions(response.sessions || []);
    } catch (err) {
      console.error('Ошибка загрузки сессий:', err);
    }
  };

  const loadCleanedSessions = async (userId: number) => {
    try {
      const response = await api.getSessions({ user_id: userId });
      const cleaned = (response.sessions || []).filter(s => s.cleanup_status === 'cleaned');
      setCleanedSessions(cleaned);
      setCleanedStats({
        total_cleaned: cleaned.length,
        total_waste_cleaned: cleaned.reduce((sum, s) => sum + (s.total_waste_count || 0), 0),
        cleaned_sessions_count: cleaned.length
      });
    } catch (err) {
      console.error('Ошибка загрузки очищенных сессий:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRequestsCount = async (userId: number) => {
    try {
      // Загружаем заявки, адресованные пользователю (для его сессий)
      const response = await fetch(`${API_BASE_URL}/cleanup/requests-for-user/?user_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const pendingRequests = (data.requests || []).filter((r: any) => r.status === 'pending');
        setPendingRequestsCount(pendingRequests.length);
      }
    } catch (err) {
      console.error('Ошибка загрузки заявок:', err);
    }
  };

  const updateCleanupStatus = async (sessionId: number, newStatus: 'cleaned' | 'pending') => {
    setUpdatingId(sessionId);
    try {
      await api.updateSessionCleanupStatus(sessionId, user!.id, newStatus);
      
      // Обновляем статус в списке сессий
      setAllSessions(prev => prev.map(m => 
        m.id === sessionId ? { ...m, cleanup_status: newStatus } : m
      ));
      
      // Обновляем список очищенных сессий
      if (newStatus === 'cleaned') {
        const updatedSession = allSessions.find(m => m.id === sessionId);
        if (updatedSession) {
          setCleanedSessions(prev => [{ ...updatedSession, cleanup_status: 'cleaned' }, ...prev]);
          setCleanedStats(prev => ({
            total_cleaned: prev.total_cleaned + 1,
            total_waste_cleaned: prev.total_waste_cleaned + (updatedSession.total_waste_count || 0),
            cleaned_sessions_count: prev.cleaned_sessions_count + 1
          }));
        }
      } else {
        setCleanedSessions(prev => prev.filter(m => m.id !== sessionId));
        const session = allSessions.find(m => m.id === sessionId);
        setCleanedStats(prev => ({
          total_cleaned: prev.total_cleaned - 1,
          total_waste_cleaned: prev.total_waste_cleaned - (session?.total_waste_count || 0),
          cleaned_sessions_count: prev.cleaned_sessions_count - 1
        }));
      }
      
      showNotification(newStatus === 'cleaned' ? '✅ Сессия отмечена как очищенная!' : '⚠️ Статус очистки сброшен', 'success');
    } catch (err) {
      showNotification('Ошибка при изменении статуса', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const updatePrivacy = async (sessionId: number, newPrivacy: 'public' | 'private') => {
    setUpdatingId(sessionId);
    try {
      const response = await fetch(`${API_BASE_URL}/sessions/${sessionId}/privacy/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id,
          privacy: newPrivacy
        }),
      });

      if (response.ok) {
        setAllSessions(prev => prev.map(m => 
          m.id === sessionId ? { ...m, privacy: newPrivacy } : m
        ));
        showNotification(`Сессия стала ${newPrivacy === 'public' ? 'публичной' : 'приватной'}`, 'success');
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка при изменении приватности', 'error');
      }
    } catch (err) {
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Фильтрация сессий
  const notCleanedSessions = allSessions.filter(m => m.cleanup_status !== 'cleaned');
  const privateSessions = notCleanedSessions.filter(m => m.privacy === 'private');
  const publicSessions = notCleanedSessions.filter(m => m.privacy === 'public');

  const handleLogout = () => {
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка профиля...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
    <head>
      <title>{user.login}</title>
    </head>
    <main className={styles.main}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.container}>
        {/* Шапка профиля */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.avatar}>
              <span className={styles.avatarIcon}>👤</span>
            </div>
            <div className={styles.userInfo}>
              <h1 className={styles.userName}>{user.login}</h1>
              <p className={styles.userEmail}>{user.email}</p>
              <span className={`${styles.roleBadge} ${user.role === 'admin' ? styles.roleAdmin : styles.roleUser}`}>
                {user.role === 'admin' ? 'Администратор' : 'Пользователь'}
              </span>
            </div>
            <div className={styles.headerButtons}>
              <button
                onClick={() => router.push('/cleanup-requests')}
                className={styles.requestsBtn}
              >
                Заявки
                {pendingRequestsCount > 0 && (
                  <span className={styles.requestsBadge}>{pendingRequestsCount}</span>
                )}
              </button>
             
            </div>
          </div>
        </div>

        {/* Вкладки */}
        <div className={styles.tabsContainer}>
          <button
            onClick={() => setActiveTab('private')}
            className={`${styles.tabButton} ${activeTab === 'private' ? styles.tabButtonActive : ''}`}
          >
            Приватные
          </button>
          <button
            onClick={() => setActiveTab('public')}
            className={`${styles.tabButton} ${activeTab === 'public' ? styles.tabButtonActive : ''}`}
          >
            Публичные
          </button>
          <button
            onClick={() => setActiveTab('cleaned')}
            className={`${styles.tabButton} ${activeTab === 'cleaned' ? styles.tabButtonActive : ''}`}
          >
            Очищенные
          </button>
        </div>

        {/* Приватные сессии */}
        {activeTab === 'private' && (
          privateSessions.length === 0 ? (
            <div className={styles.emptySessions}>
              <span className={styles.emptyIcon}>🔒</span>
              <p>Нет приватных сессий</p>
            </div>
          ) : (
            <div className={styles.missionsList}>
              {privateSessions.map((session) => (
                <div key={session.id} className={styles.missionCard}>
                  <div className={styles.missionInfo}>
                    <div className={styles.missionHeader}>
                      <h3 className={styles.missionTitle}>{session.title}</h3>
                    </div>
                    <div className={styles.missionStats}>
                      <span>{session.total_snapshots || 0} фото</span>
                      <span>{session.total_waste_count || 0} объектов</span>
                      <span>{formatDate(session.created_at)}</span>
                    </div>
                  </div>
                  <div className={styles.missionActions}>
                    <button onClick={() => router.push(`/sessions/${session.id}`)} className={styles.openBtn}>
                      Открыть
                    </button>
                    <button 
                      onClick={() => updatePrivacy(session.id, 'public')} 
                      disabled={updatingId === session.id} 
                      className={styles.publishBtn}
                    >
                      Сделать публичной
                    </button>
                    <button 
                      onClick={() => updateCleanupStatus(session.id, 'cleaned')} 
                      disabled={updatingId === session.id} 
                      className={styles.cleanupBtn}
                    >
                      {updatingId === session.id ? '...' : 'Отметить как очищенное'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Публичные сессии */}
        {activeTab === 'public' && (
          publicSessions.length === 0 ? (
            <div className={styles.emptySessions}>
              <span className={styles.emptyIcon}>🌍</span>
              <p>Нет публичных сессий</p>
            </div>
          ) : (
            <div className={styles.missionsList}>
              {publicSessions.map((session) => (
                <div key={session.id} className={styles.missionCard}>
                  <div className={styles.missionInfo}>
                    <div className={styles.missionHeader}>
                      <h3 className={styles.missionTitle}>{session.title}</h3>
                    </div>
                    <div className={styles.missionStats}>
                      <span>{session.total_snapshots || 0} фото</span>
                      <span>{session.total_waste_count || 0} объектов</span>
                      <span>{formatDate(session.created_at)}</span>
                    </div>
                  </div>
                  <div className={styles.missionActions}>
                    <button onClick={() => router.push(`/sessions/${session.id}`)} className={styles.openBtn}>
                      Открыть
                    </button>
                    <button 
                      onClick={() => updatePrivacy(session.id, 'private')} 
                      disabled={updatingId === session.id} 
                      className={styles.makePrivateBtn}
                    >
                      Сделать приватной
                    </button>
                    <button 
                      onClick={() => updateCleanupStatus(session.id, 'cleaned')} 
                      disabled={updatingId === session.id} 
                      className={styles.cleanupBtn}
                    >
                      {updatingId === session.id ? '...' : 'Отметить как очищенное'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Очищенные сессии */}
        {activeTab === 'cleaned' && (
          cleanedSessions.length === 0 ? (
            <div className={styles.emptySessions}>
              <span className={styles.emptyIcon}>♻️</span>
              <p>Пока нет очищенных сессий</p>
            </div>
          ) : (
            <div className={styles.missionsList}>
              {cleanedSessions.map((session) => (
                <div key={session.id} className={`${styles.missionCard} ${styles.cleanedCard}`}>
                  <div className={styles.missionInfo}>
                    <div className={styles.missionHeader}>
                      <h3 className={styles.missionTitle}>
                        {session.title}
                      </h3>
                      <span className={styles.cleanedBadge}>Очищено</span>
                    </div>
                    <div className={styles.missionStats}>
                      <span>{session.total_snapshots || 0} фото</span>
                      <span>{session.total_waste_count || 0} объектов</span>
                      <span>{formatDate(session.created_at)}</span>
                    </div>
                  </div>
                  <div className={styles.missionActions}>
                    <button onClick={() => router.push(`/sessions/${session.id}`)} className={styles.openBtn}>
                      Открыть
                    </button>
                    <button 
                      onClick={() => updateCleanupStatus(session.id, 'pending')} 
                      disabled={updatingId === session.id} 
                      className={styles.resetCleanupBtn}
                    >
                      {updatingId === session.id ? '...' : 'Сбросить статус'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
    </>
  );
}