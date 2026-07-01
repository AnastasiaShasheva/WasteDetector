// components/UploadZone.tsx
'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import styles from './UploadZone.module.css';

interface Props {
  onUpload: (files: File[]) => void;
  loading: boolean;
}

export default function UploadZone({ onUpload, loading }: Props) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onUpload(acceptedFiles);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'] },
    multiple: true,
  });

  return (
    <div
      {...getRootProps()}
      className={`${styles.dropzone} ${
        isDragActive ? styles.dropzoneActive : ''
      } ${loading ? styles.dropzoneLoading : ''}`}
    >
      <input {...getInputProps()} />
      <div className={styles.icon}>📁</div>
      {loading ? (
        <div>
          <div className={styles.loadingText}>
            Анализ изображений...
          </div>
        </div>
      ) : isDragActive ? (
        <p className="text-xl text-green-600">Отпустите файлы здесь...</p>
      ) : (
        <>
          <p className={styles.title}>
            Перетащите снимки с БПЛА сюда
          </p>
          <p className={styles.subtitle}>
            или кликните для выбора файлов
          </p>
          <p className={styles.hint}>
            Поддерживаются JPG, PNG
          </p>
        </>
      )}
    </div>
  );
}