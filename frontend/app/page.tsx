'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function LandingPage() {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [animationType, setAnimationType] = useState<'enter' | 'exit'>('enter');
  const [animationDirection, setAnimationDirection] = useState<'left' | 'right'>('left');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const slides = [
    {
      type: 'hero',
      title: 'Обнаружение незаконных свалок',
      subtitle: 'Загрузите фото с дрона — получите карту мусорных объектов',
      subtitle2: null,
      showButton: true,
    },
    {
      type: 'forest',
      title: 'Один гектар леса поглощает столько CO₂, сколько выделяют 50 автомобилей',
      subtitle: 'Лес даёт воздух, воду, защищает климат. В России — 20% всех лесов мира.',
      subtitle2: 'Мы за них в ответе.',
      showButton: false,
    },
    {
      type: 'dump',
      title: 'Cвалки убивают лес',
      subtitle: 'Токсины отравляют почву на десятилетия. Деревья гибнут, земля становится мёртвой. Восстановить её нельзя.',
      subtitle2: null,
      showButton: false,
    },
    {
      type: 'goal',
      title: 'Наша цель',
      subtitle: 'Сделать невидимые свалки видимыми. Нейросети находят мусор на снимках с дронов. Координаты каждой свалки — до того, как она станет катастрофой.',
      subtitle2: null,
      showButton: false,
    }
  ];

  const nextSlide = (): void => {
    if (isAnimating) return;
    setIsAnimating(true);
    setAnimationType('exit');
    setAnimationDirection('right');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev: number) => (prev + 1) % slides.length);
      setAnimationType('enter');
      setAnimationDirection('left');
    }, 300);

    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  const prevSlide = (): void => {
    if (isAnimating) return;
    setIsAnimating(true);
    setAnimationType('exit');
    setAnimationDirection('left');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev: number) => (prev - 1 + slides.length) % slides.length);
      setAnimationType('enter');
      setAnimationDirection('right');
    }, 300);

    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  const goToSlide = (index: number): void => {
    if (isAnimating) return;
    setIsAnimating(true);
    setAnimationType('exit');
    setAnimationDirection(index > currentIndex ? 'right' : 'left');

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      setCurrentIndex(index);
      setAnimationType('enter');
      setAnimationDirection(index > currentIndex ? 'left' : 'right');
    }, 300);

    setTimeout(() => {
      setIsAnimating(false);
    }, 600);
  };

  const currentSlide = slides[currentIndex];

  const getBackgroundClass = () => {
    switch (currentSlide.type) {
      case 'hero':
        return styles.heroBg;
      case 'forest':
        return styles.forestBg;
      case 'dump':
        return styles.dumpBg;
      case 'goal':
        return styles.goalBg;
      default:
        return styles.heroBg;
    }
  };

  const getAnimationClass = () => {
    if (animationType === 'exit') {
      return animationDirection === 'left' ? styles.slideExitLeft : styles.slideExitRight;
    } else {
      return animationDirection === 'left' ? styles.slideEnterFromLeft : styles.slideEnterFromRight;
    }
  };

  const getSlideClass = () => {
    return currentSlide.type === 'hero' ? styles.heroSlide : styles.nonHeroSlide;
  };

  return (
    <>
    <head>
      <title>Экопоиск</title>
    </head>
    <main className={styles.main}>
      <div className={`${styles.carouselContainer} ${getBackgroundClass()}`}>
        <div className={styles.overlay}>
          <div className={`${styles.contentWrapper} ${getAnimationClass()} ${getSlideClass()}`}>
            {currentSlide.title && (
              <h1 className={styles.bannerTitle}>{currentSlide.title}</h1>
            )}
            <p className={styles.bannerSubtitle}>{currentSlide.subtitle}</p>
            <h2 className={styles.bannerSubtitle2}>{currentSlide.subtitle2}</h2>
            {currentSlide.showButton && (
              <button
                onClick={() => router.push('/detect')}
                className={styles.startButton}
              >
                Начать анализ
              </button>
            )}
          </div>
        </div>

        <button
          className={`${styles.carouselButton} ${styles.prevButton}`}
          onClick={prevSlide}
          aria-label="Предыдущий слайд"
        >
          <span>❮</span>
        </button>
        <button
          className={`${styles.carouselButton} ${styles.nextButton}`}
          onClick={nextSlide}
          aria-label="Следующий слайд"
        >
          <span>❯</span>
        </button>

        <div className={styles.carouselDots}>
          {slides.map((_, index: number) => (
            <button
              key={index}
              className={`${styles.carouselDot} ${currentIndex === index ? styles.activeDot : ''}`}
              onClick={() => goToSlide(index)}
              aria-label={`Перейти к слайду ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.howWork}>
        <h1>Как это работает?</h1>
        <div className={styles.part}>
          <strong>1</strong>
          <p>Вы загружаете свои фотографии с БПЛА и немного ждете</p>
          <img src="tutor1.png" alt="" />
        </div>
        <div className={styles.part}>
          <strong>2</strong>
          <p>Специально обученная нейросеть ищет мусор, после чего отмечает на карте. Координаты берутся из метаданных фотографии</p>
          <img src="tutor2.png" alt="" />
        </div>
        <div className={styles.part}>
          <strong>3</strong>
          <p>Вы можете выставить фотографии, чтобы волонтеры смогли убрать и помочь природе</p>
          <img src="tutor3.jpg" alt="" />
        </div>
      </div>
    </main>
    </>
  );
}