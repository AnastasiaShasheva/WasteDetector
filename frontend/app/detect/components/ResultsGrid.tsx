'use client';

import { useState } from 'react';
import styles from './ResultsGrid.module.css';

interface Result {
  snapshot_id: number;        // было detection_id
  filename: string;
  original_url: string;
  result_url: string | null;
  waste_count: number;
  has_gps: boolean;
  latitude?: number;
  longitude?: number;
  status: string;
}

interface Props {
  results: Result[];
  onLocationClick?: (latitude: number, longitude: number) => void;
  sortOrder?: 'desc' | 'asc';
}

export default function ResultsGrid({ results, onLocationClick, sortOrder = 'desc' }: Props) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  console.log('=== RESULTS GRID DEBUG ===');
  console.log('ResultsGrid received results:', results);
  console.log('Results count:', results.length);
  if (results.length > 0) {
    console.log('First result:', results[0]);
    console.log('First result original_url:', results[0].original_url);
    console.log('First result result_url:', results[0].result_url);
    const testUrl = `http://localhost:8000${results[0].result_url || results[0].original_url}`;
    console.log('Generated image URL:', testUrl);
  }

  const handleLocationClick = (e: React.MouseEvent, lat: number, lon: number) => {
    e.stopPropagation();
    if (onLocationClick) {
      onLocationClick(lat, lon);
    }
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortOrder === 'desc') {
      return b.waste_count - a.waste_count;
    } else {
      return a.waste_count - b.waste_count;
    }
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return { text: '⏳ Ожидает', className: styles.statusPending };
      case 'verified': return { text: '✅ Верифицировано', className: styles.statusVerified };
      case 'cleaned': return { text: '♻️ Очищено', className: styles.statusCleaned };
      case 'rejected': return { text: '❌ Отклонено', className: styles.statusRejected };
      default: return { text: status, className: styles.statusDefault };
    }
  };

  return (
    <>
      <div className={styles.grid}>
        {sortedResults.map((result, index) => {
          const statusBadge = getStatusBadge(result.status);
          const imageUrl = `http://localhost:8000${result.result_url || result.original_url}`;
          
          return (
            <div
              key={result.snapshot_id || index}
              className={styles.card}
              onClick={() => setSelectedImage(imageUrl)}
            >
              <div className={styles.imageContainer}>
                <img
                  src={imageUrl}
                  alt={`Detection ${index}`}
                  className={styles.image}
                  loading="lazy"
                  onError={(e) => {
                    console.error('Image failed to load:', imageUrl);
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <span className={statusBadge.className}>
                  {statusBadge.text}
                </span>
              </div>
              <div className={styles.content}>
                <div className={styles.header}>
                  <span className={styles.filename}>
                    {result.filename}
                  </span>
                  <span className={styles.badge}>
                    {result.waste_count} объектов
                  </span>
                </div>
                <div className={styles.footer}>
                  {result.has_gps && result.latitude && result.longitude ? (
                    <span 
                      className={styles.gpsInfo}
                      onClick={(e) => handleLocationClick(e, result.latitude!, result.longitude!)}
                      title="Нажать для перехода на карту"
                    >
                      📍 {result.latitude?.toFixed(4)}°, {result.longitude?.toFixed(4)}°
                    </span>
                  ) : (
                    <span className={styles.noGpsInfo}>
                      ⚠️ Нет GPS координат
                    </span>
                  )}
                  {result.result_url ? (
                    <span className={styles.processed}>✓ Обработано</span>
                  ) : (
                    <span className={styles.notProcessed}>Нет объектов</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedImage && (
        <div
          className={styles.modalOverlay}
          onClick={() => setSelectedImage(null)}
        >
          <div className={styles.modalContent}>
            <img
              src={selectedImage}
              alt="Preview"
              className={styles.modalImage}
            />
            <button
              className={styles.modalClose}
              onClick={() => setSelectedImage(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}