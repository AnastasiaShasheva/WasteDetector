from django.contrib import admin
from django.contrib.admin import SimpleListFilter
from django.utils.html import format_html
from django.urls import reverse
from django.db.models import Count, Sum
from .models import User, Mission, Detection, CleanupRequest, MissionDetection, StatusHistory


# ========== Фильтры ==========

class MissionPrivacyFilter(SimpleListFilter):
    title = 'приватность'
    parameter_name = 'privacy'
    
    def lookups(self, request, model_admin):
        return (
            ('public', 'Публичная'),
            ('private', 'Приватная'),
            ('unlisted', 'По ссылке'),
        )
    
    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(privacy=self.value())
        return queryset


class DetectionStatusFilter(SimpleListFilter):
    title = 'статус детекции'
    parameter_name = 'status'
    
    def lookups(self, request, model_admin):
        return (
            ('pending', 'Ожидает'),
            ('verified', 'Подтверждено'),
            ('cleaning', 'В процессе уборки'),
            ('cleaned', 'Убрано'),
            ('rejected', 'Отклонено'),
        )
    
    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(status=self.value())
        return queryset


class CleanupStatusFilter(SimpleListFilter):
    title = 'статус очистки'
    parameter_name = 'cleanup_status'
    
    def lookups(self, request, model_admin):
        return (
            ('pending', 'Ожидает'),
            ('requested', 'Запрос отправлен'),
            ('approved', 'Подтверждено'),
            ('rejected', 'Отклонено'),
            ('cleaned', 'Убрано'),
        )
    
    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(cleanup_status=self.value())
        return queryset


# ========== Inline админки ==========

class MissionDetectionInline(admin.TabularInline):
    model = MissionDetection
    extra = 0
    fields = ('detection_link', 'added_at', 'notes')
    readonly_fields = ('detection_link', 'added_at')
    can_delete = True
    verbose_name = 'снимок в сессии'
    verbose_name_plural = 'снимки в сессии'
    
    def detection_link(self, obj):
        if obj.detection_id:
            url = reverse('admin:api_detection_change', args=[obj.detection_id])
            return format_html('<a href="{}">Снимок #{}</a>', url, obj.detection_id)
        return '-'
    detection_link.short_description = 'снимок'


class DetectionInline(admin.TabularInline):
    model = Detection
    extra = 0
    fields = ('id', 'filename', 'waste_count', 'has_gps', 'status', 'created_at')
    readonly_fields = ('id', 'filename', 'waste_count', 'has_gps', 'status', 'created_at')
    can_delete = False
    verbose_name = 'снимок'
    verbose_name_plural = 'снимки'
    show_change_link = True


class CleanupRequestInline(admin.TabularInline):
    model = CleanupRequest
    extra = 0
    fk_name = 'detection'  # Явно указываем, что это FK к Detection
    fields = ('id', 'requester_user', 'status', 'comment', 'created_at', 'resolved_at')
    readonly_fields = ('id', 'requester_user', 'created_at', 'resolved_at')
    can_delete = False
    verbose_name = 'заявка на очистку'
    verbose_name_plural = 'заявки на очистку'
    show_change_link = True


class StatusHistoryInline(admin.TabularInline):
    model = StatusHistory
    extra = 0
    fields = ('old_status', 'new_status', 'changed_by', 'change_reason', 'created_at')
    readonly_fields = ('old_status', 'new_status', 'changed_by', 'change_reason', 'created_at')
    can_delete = False
    verbose_name = 'история изменения статуса'
    verbose_name_plural = 'история изменения статуса'


# ========== Основные админ-классы ==========

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('id', 'login', 'email', 'role', 'is_active', 'total_detections_display', 'total_missions_display', 'avatar_preview')
    list_display_links = ('id', 'login')
    list_filter = ('role', 'is_active')
    search_fields = ('login', 'email')
    readonly_fields = ('id', 'avatar_updated_at', 'avatar_preview_large')
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'login', 'email', 'role', 'is_active')
        }),
        ('Аватар', {
            'fields': ('avatar', 'avatar_thumbnail', 'avatar_updated_at', 'avatar_preview_large'),
            'classes': ('collapse',),
        }),
    )
    
    def avatar_preview(self, obj):
        if obj.avatar:
            return format_html('<img src="{}" width="50" height="50" style="border-radius: 50%;" />', obj.avatar)
        return '-'
    avatar_preview.short_description = 'аватар'
    
    def avatar_preview_large(self, obj):
        if obj.avatar:
            return format_html('<img src="{}" width="150" style="border-radius: 50%;" />', obj.avatar)
        return '-'
    avatar_preview_large.short_description = 'аватар'
    
    def total_detections_display(self, obj):
        count = Detection.objects.filter(user_id=obj.id).count()
        return format_html('<b>{}</b>', count)
    total_detections_display.short_description = 'всего снимков'
    
    def total_missions_display(self, obj):
        count = Mission.objects.filter(user_id=obj.id).count()
        return format_html('<b>{}</b>', count)
    total_missions_display.short_description = 'всего сессий'


@admin.register(Mission)
class MissionAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'owner_link', 'session_id_short', 'privacy_badge', 'status', 'total_detections', 'total_waste_count', 'cleanup_status_badge', 'created_at')
    list_display_links = ('id', 'title')
    list_filter = ('status', MissionPrivacyFilter, 'cleanup_status', 'created_at')
    search_fields = ('title', 'description', 'session_id')
    readonly_fields = ('id', 'session_id', 'created_at', 'updated_at', 'completed_at', 'total_detections', 'total_waste_count', 'locations_count', 'cover_image_preview')
    inlines = [DetectionInline]
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'session_id', 'title', 'description', 'user', 'privacy', 'status', 'cleanup_status')
        }),
        ('Пароль (для приватных сессий)', {
            'fields': ('access_password',),
            'classes': ('collapse',),
        }),
        ('Статистика', {
            'fields': ('total_detections', 'total_waste_count', 'locations_count')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at', 'completed_at')
        }),
        ('Обложка', {
            'fields': ('cover_image', 'cover_image_preview'),
            'classes': ('collapse',),
        }),
    )
    
    def owner_link(self, obj):
        if obj.user_id:
            url = reverse('admin:api_user_change', args=[obj.user_id])
            return format_html('<a href="{}">{}</a>', url, obj.user.login if obj.user else '-')
        return '-'
    owner_link.short_description = 'владелец'
    
    def session_id_short(self, obj):
        return str(obj.session_id)[:8] + '...' if obj.session_id else '-'
    session_id_short.short_description = 'ID сессии'
    
    def privacy_badge(self, obj):
        colors = {
            'public': 'green',
            'private': 'red',
            'unlisted': 'orange'
        }
        labels = {
            'public': '🌍 Публичная',
            'private': '🔒 Приватная',
            'unlisted': '🔗 По ссылке'
        }
        color = colors.get(obj.privacy, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, labels.get(obj.privacy, obj.privacy)
        )
    privacy_badge.short_description = 'приватность'
    
    def cleanup_status_badge(self, obj):
        colors = {
            'pending': 'orange',
            'in_progress': 'blue',
            'completed': 'green',
            'verified': 'purple'
        }
        labels = {
            'pending': '⏳ Ожидает',
            'in_progress': '🔄 В процессе',
            'completed': '✅ Завершена',
            'verified': '✓ Подтверждена'
        }
        color = colors.get(obj.cleanup_status, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, labels.get(obj.cleanup_status, obj.cleanup_status)
        )
    cleanup_status_badge.short_description = 'статус очистки'
    
    def cover_image_preview(self, obj):
        if obj.cover_image:
            return format_html('<img src="{}" width="200" />', obj.cover_image)
        return '-'
    cover_image_preview.short_description = 'превью обложки'
    
    actions = ['mark_as_completed', 'make_public', 'make_private']
    
    def mark_as_completed(self, request, queryset):
        updated = queryset.update(cleanup_status='completed', status='completed')
        self.message_user(request, f'Сессий помечено как завершённые: {updated}')
    mark_as_completed.short_description = 'Пометить сессии как завершённые'
    
    def make_public(self, request, queryset):
        updated = queryset.update(privacy='public')
        self.message_user(request, f'Сессий сделано публичными: {updated}')
    make_public.short_description = 'Сделать публичными'
    
    def make_private(self, request, queryset):
        updated = queryset.update(privacy='private')
        self.message_user(request, f'Сессий сделано приватными: {updated}')
    make_private.short_description = 'Сделать приватными'


@admin.register(Detection)
class DetectionAdmin(admin.ModelAdmin):
    list_display = ('id', 'filename', 'user_link', 'waste_count', 'has_gps', 'status_badge', 'mission_link', 'created_at')
    list_display_links = ('id', 'filename')
    list_filter = (DetectionStatusFilter, 'has_gps', CleanupStatusFilter, 'created_at')
    search_fields = ('filename', 'username')
    readonly_fields = ('id', 'created_at', 'updated_at', 'processed_at', 'original_image_preview', 'result_image_preview')
    inlines = [StatusHistoryInline, CleanupRequestInline]
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'filename', 'user', 'username', 'mission')
        }),
        ('Результаты детекции', {
            'fields': ('waste_count', 'has_gps', 'location', 'status', 'cleanup_status')
        }),
        ('Изображения', {
            'fields': ('original_image_path', 'result_image_path', 'original_image_preview', 'result_image_preview')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at', 'processed_at')
        }),
        ('Очистка', {
            'fields': ('cleaned_by', 'cleaned_at', 'verification_photos'),
            'classes': ('collapse',),
        }),
    )
    
    def user_link(self, obj):
        if obj.user_id:
            url = reverse('admin:api_user_change', args=[obj.user_id])
            return format_html('<a href="{}">{}</a>', url, obj.username)
        return obj.username
    user_link.short_description = 'пользователь'
    
    def mission_link(self, obj):
        if obj.mission_id:
            url = reverse('admin:api_mission_change', args=[obj.mission_id])
            return format_html('<a href="{}">Сессия #{}</a>', url, obj.mission_id)
        return '-'
    mission_link.short_description = 'сессия'
    
    def status_badge(self, obj):
        colors = {
            'pending': 'orange',
            'verified': 'green',
            'cleaning': 'blue',
            'cleaned': 'darkgreen',
            'rejected': 'red'
        }
        labels = {
            'pending': '⏳ Ожидает',
            'verified': '✓ Подтверждено',
            'cleaning': '🔄 Уборка',
            'cleaned': '✅ Убрано',
            'rejected': '❌ Отклонено'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, labels.get(obj.status, obj.status)
        )
    status_badge.short_description = 'статус'
    
    def original_image_preview(self, obj):
        if obj.original_image_path:
            return format_html('<img src="{}" width="300" />', obj.original_image_path)
        return '-'
    original_image_preview.short_description = 'оригинал'
    
    def result_image_preview(self, obj):
        if obj.result_image_path:
            return format_html('<img src="{}" width="300" />', obj.result_image_path)
        return '-'
    result_image_preview.short_description = 'с разметкой'
    
    actions = ['mark_as_verified', 'mark_as_cleaned', 'mark_as_rejected']
    
    def mark_as_verified(self, request, queryset):
        updated = queryset.update(status='verified')
        self.message_user(request, f'Снимков подтверждено: {updated}')
    mark_as_verified.short_description = 'Подтвердить снимки'
    
    def mark_as_cleaned(self, request, queryset):
        updated = queryset.update(status='cleaned', cleanup_status='cleaned')
        self.message_user(request, f'Снимков отмечено как убранные: {updated}')
    mark_as_cleaned.short_description = 'Отметить как убранные'
    
    def mark_as_rejected(self, request, queryset):
        updated = queryset.update(status='rejected')
        self.message_user(request, f'Снимков отклонено: {updated}')
    mark_as_rejected.short_description = 'Отклонить снимки'


@admin.register(CleanupRequest)
class CleanupRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'detection_link', 'requester_link', 'status_badge', 'comment_short', 'created_at', 'resolved_at')
    list_display_links = ('id',)
    list_filter = ('status', 'created_at')
    search_fields = ('comment',)
    readonly_fields = ('id', 'created_at', 'updated_at', 'resolved_at', 'verification_photos_preview')
    fieldsets = (
        ('Основная информация', {
            'fields': ('id', 'detection', 'requester_user', 'status')
        }),
        ('Комментарии', {
            'fields': ('comment', 'resolution_comment')
        }),
        ('Фото', {
            'fields': ('verification_photos', 'verification_photos_preview')
        }),
        ('Даты', {
            'fields': ('created_at', 'updated_at', 'resolved_at')
        }),
        ('Кем подтверждено', {
            'fields': ('resolved_by',),
            'classes': ('collapse',),
        }),
    )
    
    def detection_link(self, obj):
        if obj.detection_id:
            url = reverse('admin:api_detection_change', args=[obj.detection_id])
            return format_html('<a href="{}">Снимок #{}</a>', url, obj.detection_id)
        return '-'
    detection_link.short_description = 'снимок'
    
    def requester_link(self, obj):
        if obj.requester_user_id:
            url = reverse('admin:api_user_change', args=[obj.requester_user_id])
            return format_html('<a href="{}">{}</a>', url, obj.requester_user.login if obj.requester_user else '-')
        return '-'
    requester_link.short_description = 'заявитель'
    
    def status_badge(self, obj):
        colors = {
            'pending': 'orange',
            'approved': 'green',
            'rejected': 'red'
        }
        labels = {
            'pending': '⏳ Ожидает',
            'approved': '✓ Одобрено',
            'rejected': '❌ Отклонено'
        }
        color = colors.get(obj.status, 'gray')
        return format_html(
            '<span style="color: {}; font-weight: bold;">{}</span>',
            color, labels.get(obj.status, obj.status)
        )
    status_badge.short_description = 'статус'
    
    def comment_short(self, obj):
        if obj.comment:
            return obj.comment[:50] + '...' if len(obj.comment) > 50 else obj.comment
        return '-'
    comment_short.short_description = 'комментарий'
    
    def verification_photos_preview(self, obj):
        if obj.verification_photos:
            photos_html = ''
            # Если это строка с массивом, пробуем распарсить
            if isinstance(obj.verification_photos, str):
                import json
                try:
                    photos = json.loads(obj.verification_photos)
                except:
                    photos = [obj.verification_photos]
            else:
                photos = obj.verification_photos or []
            
            for photo in photos:
                if photo:
                    photos_html += f'<img src="{photo}" width="100" style="margin: 5px;" />'
            return format_html(photos_html) if photos_html else '-'
        return '-'
    verification_photos_preview.short_description = 'фото'
    
    actions = ['approve_requests', 'reject_requests']
    
    def approve_requests(self, request, queryset):
        updated = queryset.update(status='approved')
        self.message_user(request, f'Заявок одобрено: {updated}')
    approve_requests.short_description = 'Одобрить заявки'
    
    def reject_requests(self, request, queryset):
        updated = queryset.update(status='rejected')
        self.message_user(request, f'Заявок отклонено: {updated}')
    reject_requests.short_description = 'Отклонить заявки'


@admin.register(MissionDetection)
class MissionDetectionAdmin(admin.ModelAdmin):
    list_display = ('id', 'mission_link', 'detection_link', 'added_at', 'notes_short')
    list_display_links = ('id',)
    search_fields = ('notes',)
    readonly_fields = ('id', 'added_at')
    
    def mission_link(self, obj):
        if obj.mission_id:
            url = reverse('admin:api_mission_change', args=[obj.mission_id])
            return format_html('<a href="{}">Сессия #{}</a>', url, obj.mission_id)
        return '-'
    mission_link.short_description = 'сессия'
    
    def detection_link(self, obj):
        if obj.detection_id:
            url = reverse('admin:api_detection_change', args=[obj.detection_id])
            return format_html('<a href="{}">Снимок #{}</a>', url, obj.detection_id)
        return '-'
    detection_link.short_description = 'снимок'
    
    def notes_short(self, obj):
        if obj.notes:
            return obj.notes[:50] + '...' if len(obj.notes) > 50 else obj.notes
        return '-'
    notes_short.short_description = 'заметки'


@admin.register(StatusHistory)
class StatusHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'detection_link', 'old_status', 'new_status', 'changed_by_link', 'created_at')
    list_filter = ('new_status', 'created_at')
    search_fields = ('change_reason',)
    readonly_fields = ('id', 'created_at')
    
    def detection_link(self, obj):
        if obj.detection_id:
            url = reverse('admin:api_detection_change', args=[obj.detection_id])
            return format_html('<a href="{}">Снимок #{}</a>', url, obj.detection_id)
        return '-'
    detection_link.short_description = 'снимок'
    
    def changed_by_link(self, obj):
        if obj.changed_by_id:
            url = reverse('admin:api_user_change', args=[obj.changed_by_id])
            return format_html('<a href="{}">{}</a>', url, obj.changed_by.login if obj.changed_by else '-')
        return '-'
    changed_by_link.short_description = 'кем изменено'