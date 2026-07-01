'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const userStr = localStorage.getItem('user');
      
      // Если нет пользователя и это не страница логина/регистрации - кидаем на логин
      if (!userStr && pathname !== '/login' && pathname !== '/register') {
        router.push('/login');
        setIsChecking(false);
        return;
      }

      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          
          // Проверяем активность пользователя через API (простой запрос)
          const response = await fetch(`http://localhost:8000/api/check-user/${user.id}/`);
          const data = await response.json();
          
          if (!data.is_active) {
            // Пользователь заблокирован - удаляем из localStorage и кидаем на логин
            localStorage.removeItem('user');
            router.push('/login?blocked=true');
          }
        } catch (error) {
          console.error('Ошибка проверки:', error);
        }
      }
      
      setIsChecking(false);
    };

    checkAuth();
  }, [pathname, router]);

  if (isChecking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return <>{children}</>;
}