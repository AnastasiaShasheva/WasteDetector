// app/register/page.tsx
'use client';

import { useState, ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import styles from './register.module.css';

interface FormData {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
}

export default function Register() {
    const router = useRouter();
    const [formData, setFormData] = useState<FormData>({
        username: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;

        // Для поля username применяем фильтрацию
        if (name === 'username') {
            // Фильтруем: только латиница, цифры, нижнее подчеркивание и точка
            const filteredValue = value.replace(/[^a-zA-Z0-9._]/g, '');
            setFormData(prev => ({
                ...prev,
                [name]: filteredValue
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: value
            }));
        }

        // Очищаем ошибку при вводе
        if (error) setError('');
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        // Валидация имени пользователя
        if (!formData.username || formData.username.length < 3) {
            setError('Имя пользователя должно содержать минимум 3 символа');
            setIsLoading(false);
            return;
        }

        if (formData.username.length > 20) {
            setError('Имя пользователя не должно превышать 20 символов');
            setIsLoading(false);
            return;
        }

        // Проверка на допустимые символы (только латиница, цифры, точка, нижнее подчеркивание)
        const usernameRegex = /^[a-zA-Z0-9._]+$/;
        if (!usernameRegex.test(formData.username)) {
            setError('Имя пользователя может содержать только латинские буквы, цифры, точки и нижнее подчеркивание');
            setIsLoading(false);
            return;
        }

        // Проверка на пробелы
        if (formData.username.includes(' ')) {
            setError('Имя пользователя не должно содержать пробелов');
            setIsLoading(false);
            return;
        }

        // Проверка на начало и конец с точки или подчеркивания
        if (formData.username.startsWith('.') || formData.username.startsWith('_')) {
            setError('Имя пользователя не может начинаться с точки или нижнего подчеркивания');
            setIsLoading(false);
            return;
        }

        if (formData.username.endsWith('.') || formData.username.endsWith('_')) {
            setError('Имя пользователя не может заканчиваться на точку или нижнее подчеркивание');
            setIsLoading(false);
            return;
        }

        // Проверка на повторяющиеся точки
        if (formData.username.includes('..')) {
            setError('Имя пользователя не может содержать повторяющиеся точки');
            setIsLoading(false);
            return;
        }

        // Валидация email
        if (!formData.email) {
            setError('Введите email');
            setIsLoading(false);
            return;
        }

        const emailRegex = /^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/;
        if (!emailRegex.test(formData.email)) {
            setError('Введите корректный email');
            setIsLoading(false);
            return;
        }

        // Валидация пароля
        if (!formData.password) {
            setError('Введите пароль');
            setIsLoading(false);
            return;
        }

        if (formData.password.length < 6) {
            setError('Пароль должен содержать минимум 6 символов');
            setIsLoading(false);
            return;
        }

        // Проверка подтверждения пароля
        if (formData.password !== formData.confirmPassword) {
            setError('Пароли не совпадают');
            setIsLoading(false);
            return;
        }

        try {
            // Отправляем запрос к Django API
            const response = await api.register(
                formData.username,
                formData.email,
                formData.password
            );

            console.log('Регистрация успешна:', response);

            // Перенаправляем на страницу входа с сообщением об успехе
            router.push('/login?registered=true');
            
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка регистрации. Возможно, пользователь с таким именем или email уже существует');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
        <head>
            <title>Регистрация</title>
        </head>
        <main className={styles.main}>
            <div className={styles.window}>
                <h1>Регистрация</h1>
                <p>Создайте новый аккаунт</p>

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
                            placeholder="Только латиница, цифры, . и _ (3-20 символов)"
                            disabled={isLoading}
                            required
                            autoComplete="username"
                        />
                        <small className={styles.hint}>
                            Латинские буквы, цифры, точки и нижнее подчеркивание. Без пробелов.
                        </small>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="email" className={styles.label}>
                            Email
                        </label>
                        <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            className={styles.input}
                            placeholder="example@mail.com"
                            disabled={isLoading}
                            required
                            autoComplete="email"
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
                            placeholder="Минимум 6 символов"
                            disabled={isLoading}
                            required
                            autoComplete="new-password"
                        />
                        <small className={styles.hint}>
                            Минимум 6 символов
                        </small>
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="confirmPassword" className={styles.label}>
                            Подтверждение пароля
                        </label>
                        <input
                            type="password"
                            id="confirmPassword"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            className={styles.input}
                            placeholder="Повторите пароль"
                            disabled={isLoading}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    {error && (
                        <div className={styles.error}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className={styles.button}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Регистрация...' : 'Зарегистрироваться'}
                    </button>

                    <div className={styles.loginLink}>
                        Уже есть аккаунт? <a href="/login">Войдите</a>
                    </div>
                </form>
            </div>
        </main>
        </>
    );
}