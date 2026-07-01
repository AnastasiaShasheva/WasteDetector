'use client';

import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

interface User {
  id: number;
  login: string;
  email: string;
  role: string;
  is_active?: boolean;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Проверка авторизации и статуса пользователя
  useEffect(() => {
    if (!mounted) return;

    const checkUser = async () => {
      const storedUser = localStorage.getItem('user');
      
      if (!storedUser) {
        setUser(null);
        return;
      }

      try {
        const userData = JSON.parse(storedUser);
        
        const response = await fetch(`${API_BASE_URL}/user/${userData.id}/`);
        
        if (response.ok) {
          const userInfo = await response.json();
          
          if (userInfo.role === 'banned') {
            localStorage.removeItem('user');
            setUser(null);
            
            if (pathname !== '/login' && pathname !== '/register') {
              router.push('/login?blocked=true');
            }
            return;
          }
          
          setUser({
            id: userInfo.id,
            login: userInfo.login,
            email: userInfo.email,
            role: userInfo.role,
            is_active: userInfo.is_active
          });
          
          if (userInfo.role !== userData.role) {
            localStorage.setItem('user', JSON.stringify(userInfo));
          }
        } else {
          setUser(userData);
        }
      } catch (error) {
        console.error('Ошибка проверки пользователя:', error);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      }
    };

    checkUser();
  }, [pathname, mounted, router]);

  // 👇 ПЕРИОДИЧЕСКАЯ ПРОВЕРКА СТАТУСА (КАЖДЫЕ 30 СЕКУНД) 👇
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/user/${user.id}/`);
        if (response.ok) {
          const userInfo = await response.json();
          
          if (userInfo.role === 'banned') {
            localStorage.removeItem('user');
            setUser(null);
            router.push('/login?blocked=true');
          }
        }
      } catch (error) {
        console.error('Ошибка проверки статуса:', error);
      }
    }, 30000); // каждые 30 секунд
    
    return () => clearInterval(interval);
  }, [user, router]);
  // 👆 ПЕРИОДИЧЕСКАЯ ПРОВЕРКА СТАТУСА (КАЖДЫЕ 30 СЕКУНД) 👆

  // Закрываем меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    setIsMenuOpen(false);
    router.push('/');
  };

  if (!mounted) {
    return (
      <html lang="ru">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <header className="w-full bg-green-500 shadow-lg">
            <div className="container mx-auto px-4 py-4 flex justify-between items-center">
              <Link href="/" className="text-white text-4xl font-bold hover:text-green-100 transition">
                ЭкоПоиск
              </Link>
              <nav className="space-x-10">
                <Link href="/" className="text-white text-[1.35rem] hover:text-green-100 transition">
                  Главная
                </Link>
                <Link href="/detect" className="text-white text-[1.35rem] hover:text-green-100 transition">
                  Детекция
                </Link>
                <Link href="/about" className="text-white text-[1.35rem] hover:text-green-100 transition">
                  О проекте
                </Link>
                <Link href="/login" className="text-white text-[1.35rem] hover:text-green-100 transition">
                  Войти
                </Link>
              </nav>
            </div>
          </header>
          <main className="min-h-screen">{children}</main>
          <footer className="bg-gray-800 text-white py-4 text-center">
            <p>2026</p>
            <p>ЭкоПоиск - Обнаружение незаконных свалок с помощью ИИ</p>
          </footer>
        </body>
      </html>
    );
  }

  return (
    <html lang="ru">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <header className="w-full bg-green-500 shadow-lg">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <Link href="/" className="text-white text-4xl font-bold hover:text-green-100 transition">
              ЭкоПоиск
            </Link>

            <nav className="space-x-10 flex items-center">
              <Link href="/detect" className="text-white text-[1.35rem] hover:text-green-100 transition">
                Анализ снимков
              </Link>
              <Link href="/explore" className="text-white text-[1.35rem] hover:text-green-100 transition">
                Публичные сессии
              </Link>

              {user && user.role !== 'banned' ? (
                <div className="relative" ref={menuRef}>
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="flex items-center space-x-2 text-white text-[1.35rem] hover:text-green-100 transition focus:outline-none"
                  >
                    <span>{user.login}</span>
                    <svg
                      className={`w-5 h-5 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {isMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl z-50">
                      <div className="py-2">
                        <Link
                          href="/profile"
                          onClick={() => setIsMenuOpen(false)}
                          className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 transition flex items-center space-x-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span>Профиль</span>
                        </Link>

                        {(user.role === 'moderator' || user.role === 'admin') && (
                          <Link
                            href="/moderator/reports"
                            onClick={() => setIsMenuOpen(false)}
                            className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 transition flex items-center space-x-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>Модерация жалоб</span>
                          </Link>
                        )}

                        {user.role === 'admin' && (
                          <Link
                            href="/admin"
                            onClick={() => setIsMenuOpen(false)}
                            className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 transition flex items-center space-x-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            <span>Админ-панель</span>
                          </Link>
                        )}

                        <hr className="my-2 border-gray-200" />

                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-red-600 hover:bg-gray-100 transition flex items-center space-x-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          <span>Выйти</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  href="/login"
                  className="text-white text-[1.35rem] hover:text-green-100 transition bg-green-600 px-4 py-2 rounded-lg"
                >
                  Войти
                </Link>
              )}
            </nav>
          </div>
        </header>

        <main className="min-h-screen">
          {children}
        </main>

        <footer className="bg-gray-800 text-white py-4 text-center">
          <p>Шашева Анастасия Андреевна 2026</p>
          <p>Сервис обнаружения незаконных свалок на основе дистанционного зондирования</p>
        </footer>
      </body>
    </html>
  );
}