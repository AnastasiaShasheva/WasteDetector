import os
import django

# Указываем настройки проекта (ЗАМЕНИ НА СВОЁ НАЗВАНИЕ ПРОЕКТА)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'waste_detector.settings')

django.setup()

from api.models import User  # ЗАМЕНИ 'api' НА ИМЯ ТВОЕГО ПРИЛОЖЕНИЯ
from django.contrib.auth.hashers import make_password

def create_admin():
    # Данные для входа
    login = 'admin'
    email = 'admin@example.com'
    password = 'admin123'   # ← МОЖЕШЬ ПОМЕНЯТЬ ПАРОЛЬ

    # Проверяем, есть ли уже такой пользователь
    if User.objects.filter(login=login).exists():
        print(f"Пользователь {login} уже существует!")
        return

    # Создаём администратора
    User.objects.create(
        login=login,
        email=email,
        pswd=make_password(password),
        role='admin',
        is_active=True
    )
    
    print(f"✅ Администратор создан!")
    print(f"   Логин: {login}")
    print(f"   Пароль: {password}")

if __name__ == '__main__':
    create_admin()