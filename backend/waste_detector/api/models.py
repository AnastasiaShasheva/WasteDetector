from django.db import models
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import BaseUserManager
import uuid


# ===== КАСТОМНЫЙ МЕНЕДЖЕР ДЛЯ ПОЛЬЗОВАТЕЛЯ =====
class UserManager(BaseUserManager):
    def get_by_natural_key(self, username):
        return self.get(login=username)
    
    def create_user(self, login, email, password=None, **extra_fields):
        if not login:
            raise ValueError('Логин обязателен')
        if not email:
            raise ValueError('Email обязателен')
        
        user = self.model(
            login=login,
            email=self.normalize_email(email),
            **extra_fields
        )
        if password:
            user.set_password(password)
        user.save(using=self._db)
        return user
    
    def create_superuser(self, login, email, password=None, **extra_fields):
        extra_fields.setdefault('role', 'admin')
        extra_fields.setdefault('is_active', True)
        return self.create_user(login, email, password, **extra_fields)


class User(models.Model):
    ROLE_CHOICES = (
        ('user', 'Пользователь'),
        ('moderator', 'Модератор'),
        ('admin', 'Администратор'),
    )
    
    # Обязательные атрибуты для Django auth
    USERNAME_FIELD = 'login'
    REQUIRED_FIELDS = ['email']
    
    # Используем кастомный менеджер
    objects = UserManager()
    
    id = models.AutoField(primary_key=True)
    login = models.CharField(max_length=100, unique=True)
    email = models.EmailField(max_length=255, unique=True)
    pswd = models.CharField(max_length=255)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='user')
    is_active = models.BooleanField(default=True)
    avatar = models.TextField(blank=True, null=True)
    avatar_thumbnail = models.TextField(blank=True, null=True)
    avatar_updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'users'
        managed = False
    
    def __str__(self):
        return self.login
    
    # === Обязательные свойства для Django auth ===
    @property
    def is_anonymous(self):
        return False
    
    @property
    def is_authenticated(self):
        return True
    
    @property
    def is_staff(self):
        return self.role in ['admin', 'moderator']
    
    @property
    def is_superuser(self):
        return self.role == 'admin'
    
    @property
    def username(self):
        return self.login
    
    # === Методы для работы с паролем ===
    def check_password(self, raw_password):
        return check_password(raw_password, self.pswd)
    
    def set_password(self, raw_password):
        self.pswd = make_password(raw_password)
    
    def get_username(self):
        return self.login
    
    # === Для совместимости с Django admin ===
    def has_perm(self, perm, obj=None):
        if self.role == 'admin':
            return True
        return False
    
    def has_module_perms(self, app_label):
        if self.role == 'admin':
            return True
        return False


class Mission(models.Model):
    PRIVACY_CHOICES = (
        ('public', 'Публичная'),
        ('private', 'Приватная'),
        ('unlisted', 'По ссылке'),
    )
    
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(User, on_delete=models.CASCADE, db_column='user_id', related_name='missions')
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    session_id = models.UUIDField(default=uuid.uuid4, unique=True)
    status = models.CharField(max_length=50, default='active')
    total_waste_count = models.IntegerField(default=0)
    total_detections = models.IntegerField(default=0)
    locations_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    cover_image = models.TextField(blank=True, null=True)
    privacy = models.CharField(max_length=20, choices=PRIVACY_CHOICES, default='public')
    access_password = models.CharField(max_length=255, blank=True, null=True)
    cleanup_status = models.CharField(max_length=20, default='pending')
    
    class Meta:
        db_table = 'missions'
        managed = False
    
    def __str__(self):
        return f"{self.title} (ID: {self.id})"


class Detection(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Ожидает'),
        ('verified', 'Подтверждено'),
        ('cleaning', 'В процессе уборки'),
        ('cleaned', 'Убрано'),
        ('rejected', 'Отклонено'),
    )
    
    id = models.AutoField(primary_key=True)
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_column='user_id', 
        null=True, 
        blank=True,
        related_name='detections'  # <--- добавлено
    )
    username = models.CharField(max_length=100)
    filename = models.CharField(max_length=255)
    original_image_path = models.TextField()
    result_image_path = models.TextField(blank=True, null=True)
    waste_count = models.IntegerField(default=0)
    has_gps = models.BooleanField(default=False)
    location = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    session_id = models.UUIDField(default=uuid.uuid4)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_at = models.DateTimeField(blank=True, null=True)
    cleaned_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        db_column='cleaned_by', 
        null=True, 
        blank=True, 
        related_name='cleaned_detections'
    )
    cleaned_at = models.DateTimeField(blank=True, null=True)
    verification_photos = models.TextField(blank=True, null=True)
    last_status_changed_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        db_column='last_status_changed_by', 
        null=True, 
        blank=True,
        related_name='status_changed_detections'  # <--- добавлено
    )
    mission = models.ForeignKey(
        Mission, 
        on_delete=models.SET_NULL, 
        db_column='mission_id', 
        null=True, 
        blank=True,
        related_name='detections'  # <--- добавлено
    )
    is_public_session = models.BooleanField(default=True)
    cleanup_status = models.CharField(max_length=20, default='pending')
    
    class Meta:
        db_table = 'detections'
        managed = False
    
    def __str__(self):
        return f"{self.filename} (мусора: {self.waste_count})"


class CleanupRequest(models.Model):
    STATUS_CHOICES = (
        ('pending', 'Ожидает'),
        ('approved', 'Одобрено'),
        ('rejected', 'Отклонено'),
    )
    
    id = models.AutoField(primary_key=True)
    detection = models.ForeignKey(
        Detection, 
        on_delete=models.CASCADE, 
        db_column='detection_id',
        related_name='cleanup_requests'  # <--- добавлено
    )
    requester_user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_column='requester_user_id',
        related_name='sent_cleanup_requests'  # <--- добавлено
    )
    status = models.CharField(max_length=50, default='pending')
    verification_photos = models.TextField(blank=True, null=True)
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(blank=True, null=True)
    resolved_by = models.ForeignKey(
        User, 
        on_delete=models.SET_NULL, 
        db_column='resolved_by', 
        null=True, 
        blank=True, 
        related_name='resolved_cleanup_requests'  # <--- добавлено
    )
    resolution_comment = models.TextField(blank=True, null=True)
    
    class Meta:
        db_table = 'cleanup_requests'
        managed = False
    
    def __str__(self):
        return f"Заявка #{self.id} для снимка #{self.detection_id}"


class MissionDetection(models.Model):
    id = models.AutoField(primary_key=True)
    mission = models.ForeignKey(
        Mission, 
        on_delete=models.CASCADE, 
        db_column='mission_id',
        related_name='mission_detections'  # <--- добавлено
    )
    detection = models.ForeignKey(
        Detection, 
        on_delete=models.CASCADE, 
        db_column='detection_id',
        related_name='mission_detections'  # <--- добавлено
    )
    added_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, null=True)
    
    class Meta:
        db_table = 'mission_detections'
        managed = False
        unique_together = (('mission', 'detection'),)
    
    def __str__(self):
        return f"Сессия #{self.mission_id} → Снимок #{self.detection_id}"


class StatusHistory(models.Model):
    id = models.AutoField(primary_key=True)
    detection = models.ForeignKey(
        Detection, 
        on_delete=models.CASCADE, 
        db_column='detection_id',
        related_name='status_history'  # <--- добавлено
    )
    old_status = models.CharField(max_length=50, blank=True, null=True)
    new_status = models.CharField(max_length=50)
    changed_by = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        db_column='changed_by',
        related_name='status_changes'  # <--- добавлено
    )
    change_reason = models.TextField(blank=True, null=True)
    photos = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'status_history'
        managed = False
    
    def __str__(self):
        return f"Снимок #{self.detection_id}: {self.old_status} → {self.new_status}"