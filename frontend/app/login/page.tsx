'use client';

import { useState, ChangeEvent, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import styles from './login.module.css';

function LoginForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [mounted, setMounted] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            const registered = searchParams.get('registered');
            if (registered === 'true') {
                setSuccess('Регистрация прошла успешно! Теперь вы можете войти.');
            }
            
            // Проверка на блокировку
            const blocked = searchParams.get('blocked');
            if (blocked === 'true') {
                setError('Ваш аккаунт был заблокирован администратором.');
            }
        }
    }, [searchParams, mounted]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (error) setError('');
        if (success) setSuccess('');
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setSuccess('');

        if (!formData.username || !formData.password) {
            setError('Заполните все поля');
            setIsLoading(false);
            return;
        }

        try {
    const response = await api.login(formData.username, formData.password);

    localStorage.setItem('user', JSON.stringify({
        id: response.user_id,
        login: response.login,
        email: response.email,
        role: response.role
    }));

    router.push('/detect');
} catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Неверное имя пользователя или пароль';
    setError(errorMessage);
} finally {
            setIsLoading(false);
        }
    };

    if (!mounted) {
        return (
            <div className={styles.loading}>
                Загрузка...
            </div>
        );
    }

    return (
        <>
        <head>
            <title>Вход</title>
        </head>
        <div className={styles.window}>
            <h1>Добро пожаловать!</h1>
            <p>Пожалуйста, авторизируйтесь</p>

            {success && (
                <div className={styles.success}>
                    {success}
                </div>
            )}

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGroup}>
                    <label htmlFor="username" className={styles.label}>
                        Имя пользователя
                    </label>
                    <input
                        type="text"
                        id="username"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        className={styles.input}
                        placeholder="Введите имя пользователя"
                        disabled={isLoading}
                        required
                    />
                </div>

                <div className={styles.formGroup}>
                    <label htmlFor="password" className={styles.label}>
                        Пароль
                    </label>
                    <input
                        type="password"
                        id="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        className={styles.input}
                        placeholder="Введите пароль"
                        disabled={isLoading}
                        required
                    />
                </div>

                {error && <div className={styles.error}>{error}</div>}

                <button type="submit" className={styles.button} disabled={isLoading}>
                    {isLoading ? 'Вход...' : 'Войти'}
                </button>

                <div className={styles.registerLink}>
                    Нет аккаунта? <a href="/register">Зарегистрируйтесь</a>
                </div>
            </form>
        </div>
        </>
    );
}

export default function Login() {
    return (
        <main className={styles.main}>
            <Suspense fallback={<div>Загрузка...</div>}>
                <LoginForm />
            </Suspense>
        </main>
    );
}