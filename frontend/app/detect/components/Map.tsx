'use client';

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import styles from './Map.module.css';

declare global {
  interface Window {
    ymaps: any;
  }
}

interface Result {
  filename: string;
  original: string;
  result?: string;
  waste_count: number;
  has_gps: boolean;
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

interface Props {
  results: Result[];
}

export interface MapRef {
  flyToLocation: (latitude: number, longitude: number) => void;
}

const Map = forwardRef<MapRef, Props>(({ results }, ref) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const placemarksRef = useRef<any[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const initializationRef = useRef(false);

  const geotaggedResults = results.filter(r => r.has_gps && r.latitude && r.longitude);
  
  const getCenter = useCallback(() => {
    if (geotaggedResults.length > 0) {
      return [
        geotaggedResults.reduce((sum, r) => sum + (r.latitude || 0), 0) / geotaggedResults.length,
        geotaggedResults.reduce((sum, r) => sum + (r.longitude || 0), 0) / geotaggedResults.length
      ];
    }
    return [61.6700, 50.7800];
  }, [geotaggedResults]);

  const getMarkerColor = useCallback((wasteCount: number) => {
    if (wasteCount === 0) return 'green';
    if (wasteCount < 5) return 'blue';
    if (wasteCount < 20) return 'orange';
    return 'red';
  }, []);

  useImperativeHandle(ref, () => ({
    flyToLocation: (latitude: number, longitude: number) => {
      if (mapInstanceRef.current && window.ymaps) {
        mapInstanceRef.current.panTo([latitude, longitude], {
          flying: true,
          duration: 1000
        });
        mapInstanceRef.current.setZoom(17, {
          duration: 500
        });
        
        const targetPlacemark = placemarksRef.current.find(placemark => {
          const geometry = placemark.geometry.getCoordinates();
          return geometry[0] === latitude && geometry[1] === longitude;
        });
        
        if (targetPlacemark) {
          targetPlacemark.balloon.open();
        }
      }
    }
  }));

  useEffect(() => {
    if (initializationRef.current) return;
    initializationRef.current = true;

    const loadYandexMaps = () => {
      if (document.querySelector('script[src*="api-maps.yandex"]')) {
        initMap();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://api-maps.yandex.ru/2.1/?apikey=dd0479ea-efa0-4f3d-a1f9-4b4b29f50665&lang=ru_RU';
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);
    };

    const initMap = () => {
      if (window.ymaps && mapRef.current && !mapInstanceRef.current) {
        window.ymaps.ready(() => {
          if (!mapRef.current || mapInstanceRef.current) return;
          
          const center = getCenter();
          const map = new window.ymaps.Map(mapRef.current, {
            center: center,
            zoom: 13,
            controls: ['zoomControl', 'fullscreenControl', 'typeSelector']
          });
          
          mapInstanceRef.current = map;
          setIsMapReady(true);
        });
      }
    };

    loadYandexMaps();

    return () => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch (e) {}
        mapInstanceRef.current = null;
      }
      setIsMapReady(false);
      initializationRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !window.ymaps) return;

    const map = mapInstanceRef.current;
    
    placemarksRef.current.forEach(placemark => {
      try {
        map.geoObjects.remove(placemark);
      } catch (e) {}
    });
    placemarksRef.current = [];

    if (geotaggedResults.length === 0) return;

    const newPlacemarks = geotaggedResults.map((result) => {
      const balloonContent = document.createElement('div');
      balloonContent.style.minWidth = '260px';
      balloonContent.style.maxWidth = '300px';
      balloonContent.style.fontFamily = 'Arial, sans-serif';
      
      let innerHtml = '';
      
      if (result.result) {
        innerHtml += `
          <img 
            src="http://localhost:8000${result.result}" 
            alt="Detection" 
            style="width: 100%; margin-bottom: 12px; border-radius: 8px; cursor: pointer;"
            onclick="window.open('http://localhost:8000${result.result}', '_blank')"
          />
        `;
      }
      
      innerHtml += `
        <div style="margin-bottom: 8px;">
          <strong>Файл:</strong> ${result.filename}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Мусора:</strong> ${result.waste_count} объектов
        </div>
        <div style="margin-bottom: 8px;">
          <strong>📍 Координаты:</strong><br/>
          ${result.latitude?.toFixed(6)}°, ${result.longitude?.toFixed(6)}°
        </div>
        <a 
          href="https://yandex.ru/maps/?ll=${result.longitude},${result.latitude}&z=17&pt=${result.longitude},${result.latitude},pm2rdm"
          target="_blank"
          rel="noopener noreferrer"
          style="display: inline-block; margin-top: 8px; padding: 4px 12px; background: #ffcc00; color: #333; text-decoration: none; border-radius: 4px; font-size: 12px;"
        >
          📍 Открыть в Яндекс.Картах →
        </a>
      `;
      
      balloonContent.innerHTML = innerHtml;
      
      const color = getMarkerColor(result.waste_count);
      
      const placemark = new window.ymaps.Placemark(
        [result.latitude, result.longitude],
        {
          balloonContent: balloonContent.innerHTML,
          hintContent: `${result.waste_count} объектов мусора`
        },
        {
          preset: `islands#${color}Icon`,
          balloonMaxWidth: 300,
          balloonCloseButton: true,
          balloonPanelMaxMapArea: 0,
          hideIconOnBalloonOpen: false,
          openBalloonOnClick: true
        }
      );
      
      return placemark;
    });

    newPlacemarks.forEach(placemark => {
      try {
        map.geoObjects.add(placemark);
      } catch (e) {}
    });
    
    placemarksRef.current = newPlacemarks;

    if (geotaggedResults.length > 1) {
      try {
        const bounds = window.ymaps.geoQuery(newPlacemarks).getBounds();
        if (bounds) {
          map.setBounds(bounds, {
            checkZoomRange: true,
            zoomMargin: 50
          });
        }
      } catch (e) {}
    } else if (geotaggedResults.length === 1) {
      map.setCenter([geotaggedResults[0].latitude!, geotaggedResults[0].longitude!], 16);
    }

  }, [isMapReady, geotaggedResults, getMarkerColor]);

  if (geotaggedResults.length === 0) {
    return (
      <div className={styles.noDataContainer}>
        <div className={styles.warning}>
          <div style={{ display: 'flex' }}>
            <div className={styles.warningIcon}>⚠️</div>
            <div className={styles.warningText}>
              Нет фотографий с GPS координатами. 
              Добавьте геотеги в изображения для отображения на карте.
            </div>
          </div>
        </div>
        <div className={styles.noDataContent}>
          <div className={styles.noDataTitle}>
            <div className={styles.noDataEmoji}>🗺️</div>
            <p>Нет данных для отображения на карте</p>
            <p className={styles.noDataSubtitle}>Загрузите фото с GPS метками</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.stats}>
          📍 Показано {geotaggedResults.length} из {results.length} фотографий
        </div>
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={styles.legendColorGreen}></div>
            <span className={styles.legendLabel}>Нет мусора</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendColorBlue}></div>
            <span className={styles.legendLabel}>До 5 объектов</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendColorOrange}></div>
            <span className={styles.legendLabel}>5-20 объектов</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.legendColorRed}></div>
            <span className={styles.legendLabel}>Более 20 объектов</span>
          </div>
        </div>
      </div>
      
      <div ref={mapRef} className={styles.mapContainer} />
      
      <div className={styles.footer}>
        💡 Координаты извлечены из EXIF метаданных фотографий
      </div>
    </div>
  );
});

Map.displayName = 'Map';

export default Map;