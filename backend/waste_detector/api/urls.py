from django.urls import path
from . import views

urlpatterns = [
    # Аутентификация
    path('register/', views.RegisterUserView.as_view(), name='register'),
    path('login/', views.LoginView.as_view(), name='login'),
    
    # Снимки
    path('detect/', views.CreateSnapshotView.as_view(), name='detect'),
    path('snapshots/', views.SnapshotsListView.as_view(), name='snapshots-list'),
    path('snapshots/<int:snapshot_id>/', views.SnapshotDetailView.as_view(), name='snapshot-detail'),
    
    # Сессии
    path('sessions/', views.GetSessionsView.as_view(), name='sessions-list'),
    path('sessions/create/', views.CreateSessionView.as_view(), name='create-session'),
    path('sessions/<int:session_id>/', views.UpdateSessionView.as_view(), name='session-update'),
    path('sessions/<int:session_id>/detail/', views.GetSessionDetailView.as_view(), name='session-detail'),
    path('sessions/<int:session_id>/privacy/', views.UpdateSessionPrivacyView.as_view(), name='update-session-privacy'),
    path('sessions/<int:session_id>/cleanup/', views.UpdateSessionCleanupStatusView.as_view(), name='update-cleanup'),
    path('sessions/<int:session_id>/delete/', views.DeleteSessionView.as_view(), name='delete-session'),
    
    # Заявки на очистку - ДОБАВИТЬ ЭТУ СТРОКУ
    path('sessions/<int:session_id>/request-cleanup/', views.RequestCleanupView.as_view(), name='request-cleanup'),
    path('cleanup/my-requests/', views.GetMyCleanupRequestsView.as_view(), name='my-cleanup-requests'),
    path('cleanup/resolve/<int:request_id>/', views.ResolveCleanupRequestView.as_view(), name='resolve-cleanup-request'),
    path('sessions/<int:session_id>/cleanup-requests/', views.GetSessionCleanupRequestsView.as_view(), name='session-cleanup-requests'),
    
    # Публичные
    path('public-sessions/', views.GetPublicSessionsView.as_view(), name='public-sessions'),
    path('public-sessions-map/', views.GetPublicSessionsMapView.as_view(), name='public-sessions-map'),
    path('public-sessions-for-map/', views.GetPublicSessionsForMapView.as_view(), name='public-sessions-for-map'),
    
    # Проверка пользователя
    path('check-user/<int:user_id>/', views.CheckUserActiveView.as_view(), name='check-user'),
    
    # Админка
    path('admin/users/', views.AdminUsersView.as_view(), name='admin-users'),
    path('admin/stats/', views.AdminStatsView.as_view(), name='admin-stats'),
    path('admin/users/<int:user_id>/role/', views.AdminUpdateUserRoleView.as_view(), name='admin-user-role'),
    path('admin/users/<int:user_id>/toggle/', views.AdminToggleUserView.as_view(), name='admin-user-toggle'),
    path('cleanup/requests-for-user/', views.GetRequestsForUserView.as_view(), name='requests-for-user'),

    path('admin/sessions/', views.AdminSessionsView.as_view(), name='admin-sessions'),
    path('admin/cleanup-requests/', views.AdminCleanupRequestsView.as_view(), name='admin-cleanup-requests'),
    path('admin/cleanup-requests/<int:request_id>/resolve/', views.AdminResolveCleanupRequestView.as_view(), name='admin-resolve-cleanup-request'),
    path('admin/reports/', views.AdminReportsView.as_view(), name='admin-reports'),
    path('sessions/cleaned/', views.GetCleanedSessionsView.as_view(), name='cleaned-sessions'), 
    # В urlpatterns добавьте эти два маршрута:
    path('admin/sessions/<int:session_id>/cleanup/', views.AdminUpdateSessionCleanupView.as_view(), name='admin-session-cleanup'),
    path('admin/sessions/<int:session_id>/delete/', views.AdminDeleteSessionView.as_view(), name='admin-session-delete'),
    path('reports/create/', views.CreateReportView.as_view(), name='create-report'),
    path('admin/reports/<int:report_id>/resolve/', views.AdminResolveReportView.as_view(), name='admin-resolve-report'),
    # Добавьте эту строку в urlpatterns
    path('user/<int:user_id>/', views.GetUserInfoView.as_view(), name='user-info'),
    
]