'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface CleanupRequest {
  id: number;
  session_id: number;
  session_title: string;
  requester_user_id: number;
  requester_login: string;
  status: string;
  verification_photos: string[];
  comment: string;
  created_at: string;
}

type TabType = 'pending' | 'resolved';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE_URL = 'http://localhost:8000';

const getImageUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${MEDIA_BASE_URL}/${cleanPath}`;
};

export default function CleanupRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<CleanupRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string } | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Проверка авторизации
  useEffect(() => {
    const checkAuth = async () => {
      const storedUser = localStorage.getItem('user');
      if (!storedUser) {
        router.push('/login');
        return;
      }

      try {
        const user = JSON.parse(storedUser);
        
        const response = await fetch(`${API_BASE_URL}/check-user/${user.id}/`);
        const data = await response.json();
        
        if (!data.is_active) {
          localStorage.removeItem('user');
          router.push('/login?blocked=true');
          return;
        }
        
        setCurrentUser(user);
        loadRequests(user.id);
      } catch (error) {
        console.error('Ошибка проверки:', error);
        router.push('/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadRequests = async (userId: number) => {
  try {
    // МЕНЯЕМ эндпоинт на тот, который возвращает заявки для сессий пользователя
    const response = await fetch(`${API_BASE_URL}/cleanup/requests-for-user/?user_id=${userId}`);
    if (response.ok) {
      const data = await response.json();
      setRequests(data.requests || []);
    } else {
      console.error('Ошибка загрузки:', response.status);
    }
  } catch (error) {
    console.error('Ошибка загрузки:', error);
    showNotification('Ошибка загрузки заявок', 'error');
  } finally {
    setLoading(false);
  }
};

  const resolveRequest = async (requestId: number, action: 'approve' | 'reject') => {
    setProcessingId(requestId);
    try {
      const response = await fetch(`${API_BASE_URL}/cleanup/resolve/${requestId}/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: currentUser?.id,
          action: action,
        }),
      });

      if (response.ok) {
        showNotification(
          action === 'approve' ? 'Очистка подтверждена!' : 'Запрос отклонен',
          'success'
        );
        
        // Обновляем локальное состояние
        setRequests(prev => prev.map(req => 
          req.id === requestId 
            ? { ...req, status: action === 'approve' ? 'approved' : 'rejected' }
            : req
        ));
        
        if (currentUser) {
          loadRequests(currentUser.id);
        }
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка при обработке', 'error');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return { text: 'Ожидает', className: styles.statusPending };
      case 'approved':
        return { text: 'Одобрено', className: styles.statusApproved };
      case 'rejected':
        return { text: 'Отклонено', className: styles.statusRejected };
      default:
        return { text: status, className: styles.statusDefault };
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');

  const handleSessionClick = (sessionId: number) => {
    router.push(`/sessions/${sessionId}`);
  };

  if (isCheckingAuth) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Проверка авторизации...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Загрузка заявок...</p>
      </div>
    );
  }

  return (
    <>
    <head>
      <title>Заявки на очистку</title>
    </head>
    <main className={styles.main}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div>
              <h1 className={styles.title}>Заявки на очистку</h1>
              <p className={styles.subtitle}>Пользователи сообщают об уборке мусора</p>
            </div>
            
          </div>
        </div>

        <div className={styles.tabsContainer}>
          <button
            onClick={() => setActiveTab('pending')}
            className={`${styles.tabButton} ${activeTab === 'pending' ? styles.tabButtonActive : ''}`}
          >
            Ожидают ({pendingRequests.length})
          </button>
          <button
            onClick={() => setActiveTab('resolved')}
            className={`${styles.tabButton} ${activeTab === 'resolved' ? styles.tabButtonActive : ''}`}
          >
            Обработанные ({resolvedRequests.length})
          </button>
        </div>

        {activeTab === 'pending' && (
          pendingRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}></span>
              <h3>Нет заявок на рассмотрение</h3>
              <p>Все заявки обработаны</p>
            </div>
          ) : (
            <div className={styles.requestsList}>
              {pendingRequests.map((request) => (
                <div key={request.id} className={styles.requestCard}>
                  <div className={styles.requestInfo}>
                    <div className={styles.requestHeader}>
                      <span className={styles.requester}>
                        {request.requester_login}
                      </span>
                      <button
                        onClick={() => handleSessionClick(request.session_id)}
                        className={styles.missionLink}
                      >
                        {request.session_title}
                      </button>
                      <span className={styles.date}>
                        {formatDate(request.created_at)}
                      </span>
                    </div>
                    {request.comment && (
                      <p className={styles.comment}>
                        {request.comment}
                      </p>
                    )}
                    {request.verification_photos && request.verification_photos.length > 0 && (
                      <div className={styles.proofPhotos}>
                        <span>Фото доказательства:</span>
                        <div className={styles.proofPhotosList}>
                          {request.verification_photos.map((photo, idx) => (
                            <a
                              key={idx}
                              href={getImageUrl(photo)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.proofPhotoLink}
                            >
                              Фото {idx + 1}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={styles.requestActions}>
                      <button
                        className={styles.approveBtn}
                        onClick={() => resolveRequest(request.id, 'approve')}
                        disabled={processingId === request.id}
                      >
                        {processingId === request.id ? '⏳...' : 'Подтвердить очистку'}
                      </button>
                      <button
                        className={styles.rejectBtn}
                        onClick={() => resolveRequest(request.id, 'reject')}
                        disabled={processingId === request.id}
                      >
                        {processingId === request.id ? '⏳...' : 'Отклонить'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {activeTab === 'resolved' && (
          resolvedRequests.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}></span>
              <h3>Нет обработанных заявок</h3>
              <p>Когда вы обработаете заявки, они появятся здесь</p>
            </div>
          ) : (
            <div className={styles.requestsList}>
              {resolvedRequests.map((request) => {
                const status = getStatusBadge(request.status);
                return (
                  <div key={request.id} className={`${styles.requestCard} ${styles.resolvedCard}`}>
                    <div className={styles.requestInfo}>
                      <div className={styles.requestHeader}>
                        <span className={styles.requester}>
                          {request.requester_login}
                        </span>
                        <button
                          onClick={() => handleSessionClick(request.session_id)}
                          className={styles.missionLink}
                        >
                          {request.session_title}
                        </button>
                        <span className={styles.date}>
                          {formatDate(request.created_at)}
                        </span>
                        <span className={status.className}>
                          {status.text}
                        </span>
                      </div>
                      {request.comment && (
                        <p className={styles.comment}>
                          {request.comment}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </main>
    </>
  );
}