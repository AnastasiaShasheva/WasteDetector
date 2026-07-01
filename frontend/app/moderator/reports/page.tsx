'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

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

type SortField = 'id' | 'session_title' | 'session_owner_login' | 'reporter_login' | 'reason' | 'created_at';
type SortOrder = 'asc' | 'desc';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<Report[]>([]);
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'resolved' | 'rejected'>('pending');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string; role: string } | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [notification, setNotification] = useState<{ message: string; type: string } | null>(null);
  
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

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
        
        if (user.role !== 'moderator' && user.role !== 'admin') {
          router.push('/');
          return;
        }
        
        setCurrentUser(user);
        loadReports(user.id);
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

  const loadReports = async (userId: number, status: string = 'pending') => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/reports/?admin_id=${userId}`);
      if (response.ok) {
        const data = await response.json();
        const filteredReports = (data.reports || []).filter((r: Report) => r.status === status);
        setReports(filteredReports);
        
        const allReports = data.reports || [];
        setCounts({
          pending: allReports.filter((r: Report) => r.status === 'pending').length,
          resolved: allReports.filter((r: Report) => r.status === 'resolved').length,
          rejected: allReports.filter((r: Report) => r.status === 'rejected').length
        });
      } else {
        const error = await response.json();
        showNotification(error.error || 'Ошибка загрузки', 'error');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      showNotification('Ошибка соединения с сервером', 'error');
    } finally {
      setLoading(false);
    }
  };

  const resolveReport = async (reportId: number, action: 'resolve' | 'reject') => {
    const message = action === 'resolve' 
      ? 'ВНИМАНИЕ: При подтверждении жалобы СЕССИЯ БУДЕТ УДАЛЕНА без возможности восстановления. Продолжить?' 
      : 'Отклонить жалобу?';
    
    if (!confirm(message)) return;
    
    setProcessingId(reportId);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/reports/${reportId}/resolve/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_id: currentUser?.id,
          action: action,
          resolution_comment: ''
        })
      });

      if (response.ok) {
        showNotification(
          action === 'resolve' ? 'Жалоба подтверждена, сессия удалена' : 'Жалоба отклонена',
          'success'
        );
        loadReports(currentUser!.id, activeTab);
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

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getSortedReports = () => {
    const sorted = [...reports];
    sorted.sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      if (sortField === 'created_at') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
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

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending': return styles.statusPending;
      case 'resolved': return styles.statusResolved;
      case 'rejected': return styles.statusRejected;
      default: return '';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидает';
      case 'resolved': return 'Удалена';
      case 'rejected': return 'Отклонена';
      default: return status;
    }
  };

  const openSession = (sessionId: number) => {
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

  const sortedReports = getSortedReports();

  return (
    <>
    <head>
      <title>Модерация</title>
    </head>
    <main className={styles.main}>
      {notification && (
        <div className={`${styles.notification} ${styles[notification.type]}`}>
          {notification.message}
        </div>
      )}

      <div className={styles.container}>
        {/* Шапка */} 

        {/* Вкладки */}
        

        {/* Таблица жалоб */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.spinner}></div>
            <p>Загрузка...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIcon}>📭</span>
            <h3>Нет жалоб</h3>
            <p>
              {activeTab === 'pending' && 'Нет жалоб, ожидающих рассмотрения'}
              {activeTab === 'resolved' && 'Нет удаленных сессий'}
              {activeTab === 'rejected' && 'Нет отклоненных жалоб'}
            </p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th onClick={() => handleSort('session_title')} className={styles.sortable}>
                    Сессия {sortField === 'session_title' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('session_owner_login')} className={styles.sortable}>
                    Автор {sortField === 'session_owner_login' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('reporter_login')} className={styles.sortable}>
                    Пожаловался {sortField === 'reporter_login' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('reason')} className={styles.sortable}>
                    Причина {sortField === 'reason' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className={styles.commentHeader}>Комментарий</th>
                  <th onClick={() => handleSort('created_at')} className={styles.sortable}>
                    Дата {sortField === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Статус</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedReports.map((report) => (
                  <tr key={report.id}>
                    <td className={styles.sessionCell}>
                      <button 
                        onClick={() => openSession(report.session_id)} 
                        className={styles.sessionLink}
                      >
                        {report.session_title}
                      </button>
                    </td>
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
                      <span className={`${styles.statusBadge} ${getStatusClass(report.status)}`}>
                        {getStatusText(report.status)}
                      </span>
                    </td>
                    <td>
                      {report.status === 'pending' && (
                        <div className={styles.actionButtons}>
                          <button
                            onClick={() => resolveReport(report.id, 'resolve')}
                            disabled={processingId === report.id}
                            className={styles.approveBtn}
                            title="Подтвердить жалобу (сессия будет удалена)"
                          >
                            Удалить сессию
                          </button>
                          <button
                            onClick={() => resolveReport(report.id, 'reject')}
                            disabled={processingId === report.id}
                            className={styles.rejectBtn}
                            title="Отклонить жалобу"
                          >
                            Отклонить
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
    </>
  );
}