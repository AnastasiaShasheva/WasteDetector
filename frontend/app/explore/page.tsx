'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface PublicSession {
  id: number;
  user_id: number;
  user_login: string;
  user_avatar?: string;
  title: string;
  description?: string;
  total_waste_count: number;
  total_snapshots: number;
  locations_count: number;
  created_at: string;
  cover_image?: string;
  snapshots_count: number;
  cleanup_status?: string;
}

interface MapPoint {
  id: number;
  title: string;
  waste_count: number;
  latitude: number;
  longitude: number;
}

declare global {
  interface Window {
    ymaps: any;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MEDIA_BASE_URL = 'http://localhost:8000';

const getOptimizedImageUrl = (path: string | null | undefined, width?: number): string => {
  if (!path) return '';
  if (path.startsWith('http')) {
    if (width) {
      const separator = path.includes('?') ? '&' : '?';
      return `${path}${separator}w=${width}&q=80`;
    }
    return path;
  }
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const baseUrl = `${MEDIA_BASE_URL}/${cleanPath}`;

  if (width) {
    return `${baseUrl}?w=${width}&q=80`;
  }
  return baseUrl;
};

export default function ExplorePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<PublicSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'newest' | 'waste'>('newest');
  const [imageErrors, setImageErrors] = useState<Record<number, boolean>>({});
  const [mapPoints, setMapPoints] = useState<MapPoint[]>([]);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ id: number; login: string } | null>(null);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const placemarksRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);

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
        loadPublicSessions();
        loadMapPoints();
      } catch (error) {
        console.error('Ошибка проверки:', error);
        router.push('/login');
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
  }, [router]);

  useEffect(() => {
    if (isMapExpanded && mapPoints.length > 0) {
      setTimeout(() => {
        initMap();
      }, 100);
    } else if (!isMapExpanded && mapInstanceRef.current) {
      destroyMap();
    }
  }, [isMapExpanded, mapPoints]);

  useEffect(() => {
    if (isMapReady && mapInstanceRef.current && mapPoints.length > 0 && isMapExpanded) {
      updateMarkers();
    }
  }, [isMapReady, mapPoints, isMapExpanded]);

  const loadPublicSessions = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/public-sessions/`);
      if (response.ok) {
        const data = await response.json();
        // ИСПРАВЛЕНО: data.sessions, а не data.sessions
        const sessionsList = data.sessions || [];
        const notCleaned = sessionsList.filter(
          (session: PublicSession) => session.cleanup_status !== 'completed' && session.cleanup_status !== 'cleaned'
        );
        setSessions(notCleaned);
      }
    } catch (error) {
      console.error('Ошибка загрузки сессий:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMapPoints = async () => {
  setLoadingMap(true);
  try {
    // НОВЫЙ ЭНДПОЙНТ: возвращает сессии, а не снимки
    const response = await fetch(`${API_BASE_URL}/public-sessions-for-map/`);
    if (response.ok) {
      const data = await response.json();
      console.log('API response:', data);
      
      // Ожидаем { sessions: [...] }
      const sessionsList = data.sessions || [];
      
      // Преобразуем сессии в точки для карты
      const points = sessionsList
        .filter((session: any) => session.lat && session.lon) // только с координатами
        .map((session: any) => ({
          id: session.session_id,
          title: session.title,
          waste_count: session.total_waste_count,
          latitude: parseFloat(session.lat),
          longitude: parseFloat(session.lon)
        }));
      
      console.log(`Загружено ${points.length} точек для карты`);
      setMapPoints(points);
    } else {
      console.error('Ошибка API:', response.status);
    }
  } catch (error) {
    console.error('Ошибка загрузки карты:', error);
  } finally {
    setLoadingMap(false);
  }
};

  const destroyMap = () => {
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.destroy();
      } catch (e) {}
      mapInstanceRef.current = null;
    }
    setIsMapReady(false);
  };

  const initMap = () => {
    if (mapInstanceRef.current) {
      destroyMap();
    }

    if (!mapRef.current) {
      console.log('Контейнер карты не найден');
      return;
    }

    const loadYandexMaps = () => {
      if (window.ymaps) {
        createMap();
        return;
      }

      const existingScript = document.querySelector('script[src*="api-maps.yandex"]');
      if (existingScript) {
        existingScript.addEventListener('load', createMap);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://api-maps.yandex.ru/2.1/?apikey=dd0479ea-efa0-4f3d-a1f9-4b4b29f50665&lang=ru_RU';
      script.async = true;
      script.onload = createMap;
      document.head.appendChild(script);
    };

    const createMap = () => {
      if (!window.ymaps || !mapRef.current) return;

      window.ymaps.ready(() => {
        if (!mapRef.current) return;

        const center = getCenter();
        
        const map = new window.ymaps.Map(mapRef.current, {
          center: center,
          zoom: 10,
          controls: ['zoomControl', 'fullscreenControl', 'typeSelector']
        });

        mapInstanceRef.current = map;
        setIsMapReady(true);
        
        setTimeout(() => {
          if (mapPoints.length > 0) {
            updateMarkers();
          }
        }, 100);
      });
    };

    loadYandexMaps();
  };

  const getCenter = useCallback(() => {
    if (mapPoints.length > 0) {
      const avgLat = mapPoints.reduce((sum, p) => sum + p.latitude, 0) / mapPoints.length;
      const avgLon = mapPoints.reduce((sum, p) => sum + p.longitude, 0) / mapPoints.length;
      return [avgLat, avgLon];
    }
    return [61.67, 50.78];
  }, [mapPoints]);

  const getMarkerColor = (wasteCount: number): string => {
    if (wasteCount === 0) return 'green';
    if (wasteCount < 5) return 'blue';
    if (wasteCount < 20) return 'orange';
    return 'red';
  };

  const updateMarkers = () => {
    if (!mapInstanceRef.current || !window.ymaps || mapPoints.length === 0) return;

    const map = mapInstanceRef.current;

    placemarksRef.current.forEach(placemark => {
      try {
        map.geoObjects.remove(placemark);
      } catch (e) {}
    });
    placemarksRef.current = [];

    const newPlacemarks = mapPoints.map((point) => {
      const balloonContent = document.createElement('div');
      balloonContent.style.minWidth = '200px';
      balloonContent.style.maxWidth = '280px';
      balloonContent.style.fontFamily = 'Arial, sans-serif';

      balloonContent.innerHTML = `
        <div style="margin-bottom: 10px;">
          <strong style="font-size: 14px;">${point.title}</strong>
        </div>
        <div style="margin-bottom: 8px; font-size: 12px;">
          🗑️ <strong>${point.waste_count}</strong> объектов мусора
        </div>
        <button 
          data-session-id="${point.id}"
          style="width: 100%; margin-top: 8px; padding: 8px 12px; background: #059669; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;"
          onmouseover="this.style.background='#04855c'"
          onmouseout="this.style.background='#059669'"
        >
          📂 Открыть сессию
        </button>
      `;

      const color = getMarkerColor(point.waste_count);

      const placemark = new window.ymaps.Placemark(
        [point.latitude, point.longitude],
        {
          balloonContent: balloonContent.innerHTML,
          hintContent: `${point.waste_count} объектов мусора`
        },
        {
          preset: `islands#${color}Icon`,
          balloonMaxWidth: 300,
          balloonCloseButton: true,
          openBalloonOnClick: true
        }
      );

      placemark.events.add('balloonopen', () => {
        setTimeout(() => {
          const btn = document.querySelector(`button[data-session-id="${point.id}"]`);
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              router.push(`/sessions/${point.id}`);
            });
          }
        }, 100);
      });

      return placemark;
    });

    newPlacemarks.forEach(placemark => {
      try {
        map.geoObjects.add(placemark);
      } catch (e) {}
    });

    placemarksRef.current = newPlacemarks;

    if (mapPoints.length > 1) {
      try {
        const bounds = window.ymaps.geoQuery(newPlacemarks).getBounds();
        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 50
          });
        }
      } catch (e) {}
    } else if (mapPoints.length === 1) {
      map.setCenter([mapPoints[0].latitude, mapPoints[0].longitude], 12);
    }
  };

  const getSortedSessions = () => {
    const sorted = [...sessions];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'waste':
        return sorted.sort((a, b) => b.total_waste_count - a.total_waste_count);
      default:
        return sorted;
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return `${days} дня(ей) назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
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
        <p>Загрузка...</p>
      </div>
    );
  }

  return (
    <>
    <head>
      <title>Публичные сессии</title>
    </head>
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div>
              <h1 className={styles.title}>Публичные сессии</h1>
              <p className={styles.subtitle}>Пользователи публикуют сессии, чтобы волонтеры могли помочь природе</p>
            </div>
          </div>
        </div>

        {/* Сворачиваемая карта */}
        <div className={styles.mapSection}>
          <button
            className={styles.mapToggleBtn}
            onClick={() => setIsMapExpanded(!isMapExpanded)}
          >
            <span className={styles.mapToggleText}>
              {isMapExpanded ? '▼ Скрыть карту' : '▲ Показать карту'}
            </span>
          </button>

          {isMapExpanded && (
            <div className={styles.mapContainer}>
              {loadingMap ? (
                <div className={styles.mapLoading}>
                  <div className={styles.spinnerSmall}></div>
                  <p>Загрузка карты...</p>
                </div>
              ) : mapPoints.length > 0 ? (
                <div ref={mapRef} className={styles.mapFrame} />
              ) : (
                <div className={styles.mapPlaceholder}>
                  <p>Нет данных для отображения на карте</p>
                  <p className={styles.mapPlaceholderHint}>Загрузите фото с GPS координатами</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Сортировка */}
        <div className={styles.sortBar}>
          <span className={styles.sortLabel}>Сортировать:</span>
          <div className={styles.sortButtons}>
            <button
              onClick={() => setSortBy('newest')}
              className={`${styles.sortBtn} ${sortBy === 'newest' ? styles.sortBtnActive : ''}`}
            >
              Новые
            </button>
            <button
              onClick={() => setSortBy('waste')}
              className={`${styles.sortBtn} ${sortBy === 'waste' ? styles.sortBtnActive : ''}`}
            >
              Количество мусора
            </button>
          </div>
          <span className={styles.totalCount}>Всего: {sessions.length} сессий</span>
        </div>

        {/* Список сессий */}
        {sessions.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>Пока нет публичных сессий</h3>
            <p>Станьте первым, кто поделится своей сессией!</p>
            <button onClick={() => router.push('/detect')} className={styles.createBtn}>
              Создать сессию
            </button>
          </div>
        ) : (
          <div className={styles.missionsList}>
            {getSortedSessions().map((session) => {
              const imageUrl = getOptimizedImageUrl(session.cover_image, 200);
              const hasImage = imageUrl && !imageErrors[session.id];

              return (
                <div
                  key={session.id}
                  className={styles.missionCard}
                  onClick={() => router.push(`/sessions/${session.id}`)}
                >
                  <div className={styles.cardPreview}>
                    {hasImage ? (
                      <img
                        src={imageUrl}
                        alt={session.title}
                        className={styles.previewImage}
                        loading="lazy"
                        decoding="async"
                        onError={() => setImageErrors(prev => ({ ...prev, [session.id]: true }))}
                      />
                    ) : (
                      <div className={styles.previewPlaceholder}>
                        <span>📷</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.cardContent}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.missionTitle}>{session.title}</h3>
                    </div>

                    <div className={styles.sessionContains}>
                      <span className={styles.containsLabel}>Сессия содержит:</span>
                      <span>{session.total_snapshots} фото</span>
                      <span>{session.total_waste_count} объектов</span>
                      <span>{formatDate(session.created_at)}</span>
                    </div>

                    <div className={styles.userInfo}>
                      <div className={styles.userAvatar}>
                        {session.user_avatar ? (
                          <img
                            src={getOptimizedImageUrl(session.user_avatar, 30)}
                            alt={session.user_login}
                            loading="lazy"
                          />
                        ) : (
                          <span>👤</span>
                        )}
                      </div>
                      <span className={styles.userName}>{session.user_login}</span>
                    </div>
                  </div>

                  <div className={styles.cardAction}>
                    <button className={styles.openBtn}>Открыть →</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
    </>
  );
}