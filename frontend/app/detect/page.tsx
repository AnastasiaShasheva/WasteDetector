'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import UploadZone from './components/UploadZone';
import ResultsGrid from './components/ResultsGrid';
import Map, { MapRef } from './components/Map';
import { api } from '@/lib/api';
import styles from './page.module.css';

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
  session_id_fk?: number;
}

interface Session {
  id: number;
  title: string;
  session_uuid?: string;
  user_id?: number;
  created_at: string;
  privacy: 'public' | 'private';
  cleanup_status?: string;
  total_snapshots?: number;
  total_waste_count?: number;
}

const convertToMapResult = (result: SnapshotResult) => ({
  filename: result.filename,
  original: result.original_url,
  result: result.result_url || undefined,
  waste_count: result.waste_count,
  has_gps: result.has_gps,
  latitude: result.latitude,
  longitude: result.longitude,
  altitude: result.altitude
});

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export default function DetectPage() {
  const router = useRouter();
  const [results, setResults] = useState<SnapshotResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showUploadZone, setShowUploadZone] = useState(true);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string } | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showSessionsDialog, setShowSessionsDialog] = useState(false);
  const [sessionName, setSessionName] = useState('');
  const [savingToServer, setSavingToServer] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isSessionSaved, setIsSessionSaved] = useState(false);
  
  const mapRef = useRef<MapRef>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);
  const photosSectionRef = useRef<HTMLDivElement>(null);

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
        loadSessionsFromDB(user.id);
      } catch (error) {
        console.error('Ошибка проверки:', error);
        router.push('/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  const loadSessionsFromDB = async (userId: number) => {
    setLoadingSessions(true);
    try {
      const response = await api.getSessions({ user_id: userId });
      if (response && response.sessions) {
        const notCleanedSessions = response.sessions.filter(
          (s: Session) => s.cleanup_status !== 'cleaned'
        );
        setSessions(notCleanedSessions);
      }
    } catch (error) {
      console.error('Ошибка загрузки сессий:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const saveCurrentSession = () => {
    if (results.length === 0) return;
    if (isSessionSaved) {
      showNotification('Эта сессия уже сохранена!', '#f59e0b');
      return;
    }
    setSessionName('');
    setShowSaveDialog(true);
  };

  const confirmSaveSession = async () => {
    if (results.length === 0) return;
    
    const sessionNameToSave = sessionName.trim() || `Сессия от ${new Date().toLocaleString()}`;
    
    setSavingToServer(true);
    
    try {
      // Получаем ID сессии из результатов (все фото в одной сессии)
      const sessionId = results[0]?.session_id_fk;
      
      if (!sessionId) {
        throw new Error('Нет сессии для сохранения');
      }
      
      // Обновляем название сессии
      const updateResponse = await fetch(`${API_BASE_URL}/sessions/${sessionId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          user_id: currentUser!.id, 
          title: sessionNameToSave 
        })
      });
      
      if (!updateResponse.ok) {
        throw new Error('Не удалось обновить название сессии');
      }
      
      setIsSessionSaved(true);
      localStorage.removeItem('tempSessionId');
      
      await loadSessionsFromDB(currentUser!.id);
      
      showNotification(`✅ Сессия "${sessionNameToSave}" сохранена!`, '#22c55e');
      setShowSaveDialog(false);
      setSessionName('');
      
    } catch (error) {
      console.error('Ошибка сохранения сессии:', error);
      showNotification('❌ Ошибка подключения к серверу', '#ef4444');
    } finally {
      setSavingToServer(false);
    }
  };

  const showNotification = (message: string, bgColor: string) => {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 1000;
      animation: fadeInOut 2s ease-in-out;
      font-weight: 500;
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2500);
  };

  const loadSession = async (session: Session) => {
    setLoadingSessions(true);
    try {
      const data = await api.getSessionById(session.id);
      
      if (data.snapshots && data.snapshots.length > 0) {
        const loadedResults: SnapshotResult[] = data.snapshots.map((s: any) => ({
          snapshot_id: s.id,
          filename: s.filename,
          original_url: s.original_image_path,
          result_url: s.result_image_path,
          waste_count: s.waste_count,
          has_gps: !!(s.latitude && s.longitude),
          latitude: s.latitude,
          longitude: s.longitude,
          status: 'pending',
          session_id_fk: s.session_id_fk
        }));
        setResults(loadedResults);
        setIsSessionSaved(true);
        setShowUploadZone(false);
        setShowSessionsDialog(false);
        showNotification(`Загружена сессия: ${data.title}`, '#22c55e');
      } else {
        showNotification('В этой сессии нет фотографий', '#f59e0b');
        setShowSessionsDialog(false);
      }
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      showNotification('Ошибка соединения с сервером', '#ef4444');
    } finally {
      setLoadingSessions(false);
    }
  };

  const deleteSession = async (sessionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Удалить эту сессию? Это действие нельзя отменить.')) {
      try {
        await api.deleteSession(sessionId, currentUser!.id);
        
        if (results[0]?.session_id_fk === sessionId) {
          setResults([]);
          setShowUploadZone(true);
          setIsSessionSaved(false);
          localStorage.removeItem('tempSessionId');
        }
        
        await loadSessionsFromDB(currentUser!.id);
        showNotification('✅ Сессия удалена', '#22c55e');
      } catch (error) {
        console.error('Ошибка удаления:', error);
        showNotification('❌ Ошибка подключения к серверу', '#ef4444');
      }
    }
  };

  const handleUpload = async (files: File[]) => {
    setLoading(true);

    try {
      const userId = currentUser?.id;
      
      // Создаем временную сессию для всех фото
      let tempSessionId = localStorage.getItem('tempSessionId');
      
      if (!tempSessionId) {
        const sessionResponse = await api.createSession(
          userId!,
          `Временная сессия ${new Date().toLocaleString()}`,
          'private'
        );
        tempSessionId = sessionResponse.id.toString();
        localStorage.setItem('tempSessionId', tempSessionId);
        console.log('Создана временная сессия:', tempSessionId);
      }
      
      const response = await api.createSnapshot(
        files, 
        userId, 
        parseInt(tempSessionId)
      );
      
      const newResults: SnapshotResult[] = response.results.map(r => ({
        snapshot_id: r.snapshot_id,
        filename: r.filename,
        original_url: r.original_url,
        result_url: r.result_url,
        waste_count: r.waste_count,
        has_gps: r.has_gps,
        latitude: r.latitude || undefined,
        longitude: r.longitude || undefined,
        status: 'pending',
        session_id_fk: parseInt(tempSessionId)
      }));
      
      setResults(prevResults => [...prevResults, ...newResults]);
      setShowUploadZone(false);
      
    } catch (error) {
      console.error('Ошибка детекции:', error);
      alert('Ошибка при обработке изображений. Проверьте, что сервер Django запущен.');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueUpload = () => {
    setShowUploadZone(true);
  };

  const handleStartOver = () => {
    if (confirm('Вы уверены? Текущие результаты будут потеряны.')) {
      setResults([]);
      setShowUploadZone(true);
      setIsSessionSaved(false);
      localStorage.removeItem('tempSessionId');
      setLoading(false);
    }
  };

  const handleCancelUpload = () => {
    setShowUploadZone(false);
  };

  const handleLocationClick = async (latitude: number, longitude: number) => {
    showNotification('📍 Переход к карте...', '#3b82f6');
    
    if (mapSectionRef.current) {
      const rect = mapSectionRef.current.getBoundingClientRect();
      const offset = 80;
      const elementPosition = rect.top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
      
      await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    if (mapRef.current) {
      mapRef.current.flyToLocation(latitude, longitude);
    }
  };

  const totalWaste = results.reduce((sum, r) => sum + r.waste_count, 0);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPrivacyIcon = (privacy: string) => {
    switch (privacy) {
      case 'public': return '🌍';
      case 'private': return '🔒';
      default: return '🔒';
    }
  };

  if (isCheckingAuth) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner}></div>
        <p>Проверка авторизации...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <>
      <head>
        <title>Анализ снимков</title>
        <meta name="description" content="Загрузите фото с БПЛА для обнаружения незаконных свалок с помощью ИИ" />
      </head>
      <main className={styles.main}>
        {showSaveDialog && (
          <div className={styles.modalOverlay} onClick={() => setShowSaveDialog(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>Сохранить сессию</h3>
                <button className={styles.modalClose} onClick={() => setShowSaveDialog(false)}>✕</button>
              </div>
              <div className={styles.modalBody}>
                <label className={styles.modalLabel}>Название сессии</label>
                <input
                  type="text"
                  className={styles.modalInput}
                  placeholder="Например: Поездка в лес 15 мая"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  autoFocus
                />
                <p className={styles.modalHint}>
                  {results.length} фото | {totalWaste} объектов мусора
                </p>
                <p className={styles.modalPrivacyHint}>
                  💡 Сессия будет сохранена с указанным названием.
                </p>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.modalCancelBtn} onClick={() => setShowSaveDialog(false)}>
                  Отмена
                </button>
                <button 
                  className={styles.modalSaveBtn} 
                  onClick={confirmSaveSession}
                  disabled={savingToServer}
                >
                  {savingToServer ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSessionsDialog && (
          <div className={styles.modalOverlay} onClick={() => setShowSessionsDialog(false)}>
            <div className={styles.sessionsModalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3>Ваши сессии ({sessions.length})</h3>
                <button className={styles.modalClose} onClick={() => setShowSessionsDialog(false)}>✕</button>
              </div>
              
              <div className={styles.sessionsModalBody}>
                {loadingSessions ? (
                  <div className={styles.emptySessions}>
                    <div className={styles.spinner}></div>
                    <p>Загрузка сессий...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className={styles.emptySessions}>
                    <p>У вас пока нет сохранённых сессий</p>
                    <p className={styles.emptySubtitle}>Создайте сессию, нажав "Сохранить как сессию"</p>
                  </div>
                ) : (
                  <div className={styles.sessionsModalList}>
                    {sessions.map((session) => (
                      <div key={session.id} className={styles.sessionModalItem}>
                        <div className={styles.sessionModalInfo}>
                          <div className={styles.sessionModalName}>
                            <span>{getPrivacyIcon(session.privacy)}</span>
                            <strong>{session.title}</strong>
                          </div>
                          <div className={styles.sessionModalDetails}>
                            <span>{formatDate(session.created_at)}</span>
                            <span>{session.total_snapshots || 0} фото</span>
                            <span>{session.total_waste_count || 0} объектов</span>
                          </div>
                        </div>
                        <div className={styles.sessionModalActions}>
                          <button 
                            onClick={() => loadSession(session)} 
                            className={styles.sessionModalLoadBtn}
                            disabled={loadingSessions}
                          >
                            Загрузить
                          </button>
                          <button 
                            onClick={(e) => deleteSession(session.id, e)} 
                            className={styles.sessionModalDeleteBtn}
                            aria-label="Удалить сессию"
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.modalCancelBtn} onClick={() => setShowSessionsDialog(false)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.sessionBar}>
            <button
              onClick={() => setShowSessionsDialog(true)}
              className={styles.sessionButton}
            >
              Мои сессии
            </button>
          </div>

          {showUploadZone && (
            <>
              <UploadZone onUpload={handleUpload} loading={loading} />
              {results.length > 0 && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={handleCancelUpload}
                    className={styles.buttonCancel}
                    disabled={loading}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </>
          )}

          {results.length > 0 && (
            <>
              <div className={styles.buttonGroup}>
                <button
                  onClick={handleContinueUpload}
                  className={styles.buttonPrimary}
                  disabled={loading}
                >
                  Добавить ещё изображения
                </button>
                <button
                  onClick={saveCurrentSession}
                  className={styles.buttonSave}
                  disabled={!results.length || isSessionSaved}
                >
                  {isSessionSaved ? '✓ Сессия сохранена' : 'Сохранить как сессию'}
                </button>
                <button
                  onClick={handleStartOver}
                  className={styles.buttonSecondary}
                  disabled={loading}
                >
                  Начать заново
                </button>
              </div>

              <div ref={mapSectionRef} className={styles.section}>
                <h2 className={styles.sectionTitle}>Карта обнаружений</h2>
                <Map ref={mapRef} results={results.map(convertToMapResult)} />
              </div>

              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Статистика</h2>
                <div className={styles.statsCompactGrid}>
                  <div className={styles.statCompactCard}>
                    <div>
                      <div className={styles.statCompactValue}>{results.length}</div>
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
                      <div className={styles.statCompactValue}>{Math.round(totalWaste / results.length || 0)}</div>
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
                <ResultsGrid
                  results={results}
                  onLocationClick={handleLocationClick}
                  sortOrder={sortOrder}
                />
              </div>
            </>
          )}
        </div>

        <style jsx global>{`
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(20px); }
            15% { opacity: 1; transform: translateY(0); }
            85% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
        `}</style>
      </main>
    </>
  );
}