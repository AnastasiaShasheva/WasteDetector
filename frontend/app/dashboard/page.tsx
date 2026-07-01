// app/dashboard/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: number;
  login: string;
  email: string;
  role: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setLoading(false);
    } else {
      router.push('/login');
    }
  }, [router]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-xl">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            Добро пожаловать, {user.login}!
          </h1>
          <p className="text-gray-600 mb-8">
            Это ваша персональная панель управления
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <Link
              href="/detect"
              className="block p-6 bg-green-50 rounded-lg hover:bg-green-100 transition"
            >
              <div className="text-2xl mb-2">🚮</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Новая детекция
              </h2>
              <p className="text-gray-600">
                Загрузите фото для обнаружения мусора с помощью ИИ
              </p>
            </Link>

            <Link
              href="/profile"
              className="block p-6 bg-blue-50 rounded-lg hover:bg-blue-100 transition"
            >
              <div className="text-2xl mb-2">👤</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Мой профиль
              </h2>
              <p className="text-gray-600">
                Просмотр и редактирование личной информации
              </p>
            </Link>

            <Link
              href="/map"
              className="block p-6 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition"
            >
              <div className="text-2xl mb-2">🗺️</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Карта свалок
              </h2>
              <p className="text-gray-600">
                Просмотр обнаруженных свалок на карте
              </p>
            </Link>

            <Link
              href="/history"
              className="block p-6 bg-purple-50 rounded-lg hover:bg-purple-100 transition"
            >
              <div className="text-2xl mb-2">📊</div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                Мои детекции
              </h2>
              <p className="text-gray-600">
                История ваших обнаружений и запросов на очистку
              </p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}