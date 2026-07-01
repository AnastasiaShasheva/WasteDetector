'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Map, { MapRef } from '@/app/detect/components/Map';
import ResultsGrid from '@/app/detect/components/ResultsGrid';
import { api } from '@/lib/api';
import styles from './page.module.css';

interface SnapshotResult {
  id: number;
  filename: string;
  original_image_path: string;
  result_image_path: string | null;
  waste_count: number;
  has_gps: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  status: string;
  created_at: string;
}

interface SessionDetail {
  id: number;
  user_id: number;
  user_login: string;
  user_avatar?: string;
  title: string;
  description?: string;
  status: string;
  privacy: string;
  cleanup_status: string;
  total_waste_count: number;
  total_snapshots: number;
  locations_count: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  cover_image?: string;
  snapshots: SnapshotResult[];
}

const convertToMapResult = (result: SnapshotResult) => ({
  filename: result.filename,
  original: result.original_image_path,
  result: result.result_image_path || undefined,
  waste_count: result.waste_count,
  has_gps: result.has_gps,
  latitude: result.latitude,
  longitude: result.longitude,
  altitude: result.altitude
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE_URL = 'http://localhost:8000';

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string } | null>(null);
  const [updatingCleanup, setUpdatingCleanup] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestComment, setRequestComment] = useState('');
  const [requestPhotos, setRequestPhotos] = useState<File[]>([]);
  const [sendingRequest, setSendingRequest] = useState(false);
  
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportComment, setReportComment] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  
  const mapRef = useRef<MapRef>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const statsSectionRef = useRef<HTMLDivElement>(null);
  const photosSectionRef = useRef<HTMLDivElement>(null);

  // ТОЛЬКО проверка авторизации
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
      } catch (error) {
        console.error('Ошибка проверки:', error);
        router.push('/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  // Загрузка сессии - запускается только после проверки авторизации
  useEffect(() => {
    const loadSession = async () => {
      if (!params.id || !currentUser || isCheckingAuth) return;
      
      try {
        setLoading(true);
        const data = await api.getSessionById(Number(params.id));
        console.log('=== SESSION DATA ===');
        console.log('data:', data);
        console.log('snapshots:', data.snapshots);
        if (data.snapshots && data.snapshots.length > 0) {
          console.log('first snapshot:', data.snapshots[0]);
        }
        setSession(data as unknown as SessionDetail);
      } catch (error) {
        console.error('Ошибка загрузки сессии:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSession();
  }, [params.id, currentUser, isCheckingAuth]);

  const handleLocationClick = async (latitude: number, longitude: number) => {
    if (mapSectionRef.current) {
      const rect = mapSectionRef.current.getBoundingClientRect();
      const isMapVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;

      if (!isMapVisible) {
        const offset = 80;
        const elementPosition = rect.top;
        const offsetPosition = elementPosition + window.pageYOffset - offset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });

        await new Promise(resolve => setTimeout(resolve, 600));
      }
    }

    if (mapRef.current) {
      mapRef.current.flyToLocation(latitude, longitude);
    }
  };

  const updateCleanupStatus = async (newStatus: 'cleaned' | 'pending') => {
    if (!session || !currentUser) return;
    
    setUpdatingCleanup(true);
    try {
      await api.updateSessionCleanupStatus(session.id, currentUser.id, newStatus);
      setSession(prev => prev ? { ...prev, cleanup_status: newStatus } : prev);
      alert(newStatus === 'cleaned' ? 'Сессия отмечена как очищенная!' : 'Статус сброшен');
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка при изменении статуса');
    } finally {
      setUpdatingCleanup(false);
    }
  };

  const sendCleanupRequest = async () => {
    if (!session || !currentUser) return;

    setSendingRequest(true);
    try {
      await api.requestSessionCleanup(session.id, currentUser.id, requestComment, requestPhotos);
      alert('Заявка на очистку отправлена автору сессии!');
      setShowRequestModal(false);
      setRequestComment('');
      setRequestPhotos([]);
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка при отправке заявки');
    } finally {
      setSendingRequest(false);
    }
  };

  const sendReport = async () => {
    if (!session || !currentUser) return;
    
    setSendingReport(true);
    try {
      const response = await fetch(`${API_BASE_URL}/reports/create/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.id,
          user_id: currentUser.id,
          reason: reportReason,
          comment: reportComment
        })
      });
      
      if (response.ok) {
        alert('Жалоба отправлена администратору');
        setShowReportModal(false);
        setReportReason('');
        setReportComment('');
      } else {
        const error = await response.json();
        alert(error.error || 'Ошибка при отправке жалобы');
      }
    } catch (error) {
      console.error('Ошибка:', error);
      alert('Ошибка соединения с сервером');
    } finally {
      setSendingReport(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setRequestPhotos(prev => [...prev, ...files]);
    }
  };

  const removePhoto = (index: number) => {
    setRequestPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        <p>Загрузка сессии...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className={styles.errorContainer}>
        <h2>Сессия не найдена</h2>
        <button onClick={() => router.push('/explore')} className={styles.backBtn}>
          Вернуться к ленте
        </button>
      </div>
    );
  }

  const totalWaste = session.total_waste_count;
  const avgWaste = session.total_snapshots > 0 ? (totalWaste / session.total_snapshots).toFixed(1) : '0';
  const isOwner = currentUser?.id === session.user_id;
  const isCleaned = session.cleanup_status === 'cleaned';
  
  const snapshotsList = Array.isArray(session.snapshots) ? session.snapshots : [];

  return (
    <>
    <head>
      <title>{session.title}</title>
    </head>
    <main className={styles.main}>
      {/* Модальные окна (без изменений) */}
      {showRequestModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRequestModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Заявка на очистку</h3>
              <button className={styles.modalClose} onClick={() => setShowRequestModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalInfo}>
                <p>Сессия: <strong>{session.title}</strong></p>
                <p>Обнаружено мусора: <strong>{totalWaste} объектов</strong></p>
              </div>
              
              <div className={styles.modalFormGroup}>
                <label>Комментарий (необязательно):</label>
                <textarea
                  className={styles.modalTextarea}
                  placeholder="Например: Мусор был убран 15 мая силами волонтеров..."
                  value={requestComment}
                  onChange={(e) => setRequestComment(e.target.value)}
                  rows={3}
                />
              </div>
              
              <div className={styles.modalFormGroup}>
                <label>Фото доказательства (необязательно):</label>
                <div className={styles.photoUploadArea}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    className={styles.photoInput}
                    id="photoInput"
                  />
                  <label htmlFor="photoInput" className={styles.photoUploadLabel}>
                    Выбрать фото
                  </label>
                </div>
                {requestPhotos.length > 0 && (
                  <div className={styles.photoPreviewList}>
                    {requestPhotos.map((photo, idx) => (
                      <div key={idx} className={styles.photoPreviewItem}>
                        <span>{photo.name}</span>
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className={styles.removePhotoBtn}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setShowRequestModal(false)}>
                Отмена
              </button>
              <button
                className={styles.modalSubmitBtn}
                onClick={sendCleanupRequest}
                disabled={sendingRequest}
              >
                {sendingRequest ? 'Отправка...' : 'Отправить заявку'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className={styles.modalOverlay} onClick={() => setShowReportModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Пожаловаться на сессию</h3>
              <button className={styles.modalClose} onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalInfo}>
                <p>Сессия: <strong>{session.title}</strong></p>
                <p>Автор: <strong>{session.user_login}</strong></p>
              </div>
              
              <div className={styles.modalFormGroup}>
                <label>Причина жалобы:</label>
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className={styles.modalSelect}
                  required
                >
                  <option value="">Выберите причину</option>
                  <option value="spam">Спам</option>
                  <option value="inappropriate">Неприемлемое содержание</option>
                  <option value="fake">Фальшивая информация</option>
                  <option value="other">Другое</option>
                </select>
              </div>
              
              <div className={styles.modalFormGroup}>
                <label>Комментарий (необязательно):</label>
                <textarea
                  className={styles.modalTextarea}
                  placeholder="Опишите проблему подробнее..."
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.modalCancelBtn} onClick={() => setShowReportModal(false)}>
                Отмена
              </button>
              <button
                className={styles.modalSubmitBtn}
                onClick={sendReport}
                disabled={sendingReport || !reportReason}
              >
                {sendingReport ? 'Отправка...' : 'Отправить жалобу'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.topBarLeft}>
            <button onClick={() => router.back()} className={styles.backButton}>
              ← Назад
            </button>
          </div>
          <div className={styles.topBarRight}>
            {isOwner ? (
              <button
                onClick={() => updateCleanupStatus(isCleaned ? 'pending' : 'cleaned')}
                disabled={updatingCleanup}
                className={isCleaned ? styles.resetCleanupBtn : styles.markCleanedBtn}
              >
                {isCleaned ? 'Сбросить статус' : 'Отметить как очищенное'}
              </button>
            ) : (
              !isCleaned && (
                <>
                  <button
                    onClick={() => setShowRequestModal(true)}
                    className={styles.requestCleanupBtn}
                  >
                    Сообщить об уборке
                  </button>
                  <button
                    onClick={() => setShowReportModal(true)}
                    className={styles.reportBtn}
                  >
                    Пожаловаться
                  </button>
                </>
              )
            )}
          </div>
        </div>

        <div className={styles.missionHeaderCard}>
          <h1 className={styles.missionTitle}>{session.title}</h1>
          <div className={styles.missionMeta}>
            <span className={styles.userInfo}>
              <span className={styles.userAvatar}>
                {session.user_avatar ? (
                  <img src={`${MEDIA_BASE_URL}${session.user_avatar}`} alt={session.user_login} />
                ) : (
                  '👤'
                )}
              </span>
              <span>{session.user_login}</span>
            </span>
            <span className={styles.privacyBadge}>
              {session.privacy === 'public' ? 'Публичная' : 'Приватная'}
            </span>
            <span>{formatDate(session.created_at)}</span>
          </div>
        </div>

        <div ref={mapSectionRef} className={styles.section}>
          <h2 className={styles.sectionTitle}>Карта обнаружений</h2>
          {snapshotsList.length > 0 ? (
            <Map ref={mapRef} results={snapshotsList.map(convertToMapResult)} />
          ) : (
            <div className={styles.noDataCard}>
              <p>Нет фотографий с GPS координатами</p>
            </div>
          )}
        </div>

        <div ref={statsSectionRef} className={styles.section}>
          <h2 className={styles.sectionTitle}>Статистика</h2>
          <div className={styles.statsCompactGrid}>
            <div className={styles.statCompactCard}>
              <div>
                <div className={styles.statCompactValue}>{session.total_snapshots}</div>
                <div className={styles.statCompactLabel}>фото</div>
              </div>
            </div>
            <div className={styles.statCompactCard}>
              <div>
                <div className={styles.statCompactValue}>{totalWaste}</div>
                <div className={styles.statCompactLabel}>объектов</div>
              </div>
            </div>
            <div className={styles.statCompactCard}>
              <div>
                <div className={styles.statCompactValue}>{avgWaste}</div>
                <div className={styles.statCompactLabel}>в среднем</div>
              </div>
            </div>
          </div>
        </div>

        <div ref={photosSectionRef} className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Фотографии с обнаружениями</h2>
            <div className={styles.sortPanelInline}>
              <div className={styles.sortControls}>
                <span className={styles.sortLabel}>Сортировать:</span>
                <button
                  onClick={() => setSortOrder('desc')}
                  className={`${styles.sortButtonInline} ${sortOrder === 'desc' ? styles.sortButtonActiveInline : ''}`}
                >
                  По убыванию
                </button>
                <button
                  onClick={() => setSortOrder('asc')}
                  className={`${styles.sortButtonInline} ${sortOrder === 'asc' ? styles.sortButtonActiveInline : ''}`}
                >
                  По возрастанию
                </button>
              </div>
            </div>
          </div>
          {snapshotsList.length > 0 ? (
            <ResultsGrid
              results={snapshotsList.map(s => ({
                snapshot_id: s.id,
                filename: s.filename,
                original_url: s.original_image_path,
                result_url: s.result_image_path,
                waste_count: s.waste_count,
                has_gps: s.has_gps,
                latitude: s.latitude,
                longitude: s.longitude,
                status: s.status
              }))}
              onLocationClick={handleLocationClick}
              sortOrder={sortOrder}
            />
          ) : (
            <div className={styles.noDataCard}>
              <p>В этой сессии нет фотографий</p>
            </div>
          )}
        </div>
      </div>
    </main>
    </>
  );
}