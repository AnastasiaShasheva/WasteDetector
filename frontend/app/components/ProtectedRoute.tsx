// components/ProtectedRoute.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'user' | 'moderator' | 'admin';
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const userStr = localStorage.getItem('user');
      
      if (!userStr) {
        router.push('/login');
        return;
      }

      try {
        const user = JSON.parse(userStr);
        
        // Проверка роли если требуется
        if (requiredRole && user.role !== requiredRole && user.role !== 'admin') {
          router.push('/');
          return;
        }
        
        // Проверка активности
        const response = await fetch(`http://localhost:8000/api/check-user/${user.id}/`);
        const data = await response.json();
        
        if (!data.is_active) {
          localStorage.removeItem('user');
          router.push('/login?blocked=true');
          return;
        }
        
        setIsAuthorized(true);
      } catch (error) {
        console.error('Ошибка проверки:', error);
        router.push('/login');
      } finally {
        setIsChecking(false);
      }
    };

    checkAuth();
  }, [router, requiredRole]);

  if (isChecking) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  return isAuthorized ? <>{children}</> : null;
}