from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db import connection
from django.db import IntegrityError
from ultralytics import YOLO
from PIL import Image
import piexif
import os
import uuid
from datetime import datetime
from django.conf import settings
import bcrypt
from functools import wraps


class WasteDetector:
    _model = None
    
    @classmethod
    def get_model(cls):
        if cls._model is None:
            model_path = os.path.join(settings.BASE_DIR, 'AI.pt')
            cls._model = YOLO(model_path)
        return cls._model


def extract_gps_from_image(image_path):
    """Извлечение GPS координат из EXIF метаданных"""
    try:
        img = Image.open(image_path)
        exif = img.info.get('exif')
        
        if exif:
            exif_dict = piexif.load(exif)
            gps = exif_dict.get('GPS', {})
            
            if gps and piexif.GPSIFD.GPSLatitude in gps and piexif.GPSIFD.GPSLongitude in gps:
                lat = convert_to_degrees(gps[piexif.GPSIFD.GPSLatitude])
                lon = convert_to_degrees(gps[piexif.GPSIFD.GPSLongitude])
                
                if gps.get(piexif.GPSIFD.GPSLatitudeRef) == 'S':
                    lat = -lat
                if gps.get(piexif.GPSIFD.GPSLongitudeRef) == 'W':
                    lon = -lon
                
                return {'lat': lat, 'lon': lon}
    except Exception as e:
        print(f"Ошибка чтения GPS: {e}")
    
    return None


def convert_to_degrees(value):
    if not value or len(value) != 3:
        return 0.0
    
    degrees = value[0][0] / value[0][1] if value[0][1] != 0 else 0
    minutes = value[1][0] / value[1][1] if value[1][1] != 0 else 0
    seconds = value[2][0] / value[2][1] if value[2][1] != 0 else 0
    
    return degrees + (minutes / 60.0) + (seconds / 3600.0)


def check_user_active(view_func):
    """Декоратор для проверки активности пользователя"""
    @wraps(view_func)
    def wrapper(self, request, *args, **kwargs):
        user_id = request.data.get('user_id') or request.query_params.get('user_id')
        
        if not user_id and 'user_id' in kwargs:
            user_id = kwargs.get('user_id')
        
        if user_id:
            with connection.cursor() as cursor:
                cursor.execute("SELECT is_active FROM users WHERE id = %s", [user_id])
                result = cursor.fetchone()
                if result and not result[0]:
                    return Response({'error': 'Ваш аккаунт заблокирован. Обратитесь к администратору.'}, 
                                  status=status.HTTP_403_FORBIDDEN)
        
        return view_func(self, request, *args, **kwargs)
    return wrapper


class RegisterUserView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        login = request.data.get('login')
        email = request.data.get('email')
        password = request.data.get('password')
        
        if not login or not email or not password:
            return Response({'error': 'Все поля обязательны'}, status=status.HTTP_400_BAD_REQUEST)
        
        hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO users (login, email, pswd, role, is_active)
                    VALUES (%s, %s, %s, 'user', true)
                    RETURNING id, login, email, role
                """, [login, email, hashed.decode('utf-8')])
                
                user_data = cursor.fetchone()
                
            return Response({
                'id': user_data[0],
                'login': user_data[1],
                'email': user_data[2],
                'role': user_data[3]
            }, status=status.HTTP_201_CREATED)
            
        except IntegrityError:
            return Response({'error': 'Пользователь с таким login или email уже существует'}, 
                          status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        login = request.data.get('login')
        password = request.data.get('password')
        
        if not login or not password:
            return Response({'error': 'Логин и пароль обязательны'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, login, email, role, pswd, is_active
                    FROM users 
                    WHERE login = %s
                """, [login])
                user = cursor.fetchone()
            
            if not user:
                return Response({'error': 'Пользователь не найден'}, status=status.HTTP_404_NOT_FOUND)
            
            user_id, user_login, user_email, role, hashed_password, is_active = user
            
            if not is_active:
                return Response({'error': 'Ваш аккаунт заблокирован. Обратитесь к администратору.'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            if bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8')):
                return Response({
                    'user_id': user_id,
                    'login': user_login,
                    'email': user_email,
                    'role': role,
                    'message': 'Успешный вход'
                })
            else:
                return Response({'error': 'Неверный пароль'}, status=status.HTTP_401_UNAUTHORIZED)
                
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CreateSnapshotView(APIView):
    """Создание снимка - НЕ создает новую сессию"""
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [AllowAny]
    
    def post(self, request):
        images = request.FILES.getlist('images')
        user_id = request.data.get('user_id')
        session_id_fk = request.data.get('session_id_fk')
        
        print(f"=== CreateSnapshotView ===")
        print(f"user_id: {user_id}")
        print(f"session_id_fk (переданный): {session_id_fk}")
        
        if not images:
            return Response({'error': 'Нет загруженных изображений'}, status=status.HTTP_400_BAD_REQUEST)
        
        # ВАЖНО: НЕ создаем новую сессию автоматически!
        # Если session_id_fk не передан или не существует - возвращаем ошибку
        session_id_int = None
        
        if session_id_fk and session_id_fk != 'null' and session_id_fk != '':
            try:
                session_id_int = int(session_id_fk)
                with connection.cursor() as cursor:
                    cursor.execute("SELECT id FROM sessions WHERE id = %s", [session_id_int])
                    if not cursor.fetchone():
                        return Response({'error': f'Сессия {session_id_int} не существует'}, 
                                      status=status.HTTP_400_BAD_REQUEST)
            except (ValueError, TypeError):
                return Response({'error': 'Неверный формат session_id_fk'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        else:
            # Если сессия не передана - создаем ВРЕМЕННУЮ ОДНУ ДЛЯ ВСЕХ ФОТО
            with connection.cursor() as cursor:
                title = f"Временная сессия {uuid.uuid4().hex[:8]}"
                session_uuid = str(uuid.uuid4())
                cursor.execute("""
                    INSERT INTO sessions (user_id, title, session_id, privacy, cleanup_status, created_at)
                    VALUES (%s, %s, %s, 'private', 'pending', NOW())
                    RETURNING id
                """, [
                    int(user_id) if user_id and user_id != 'null' else None,
                    title,
                    session_uuid
                ])
                session_id_int = cursor.fetchone()[0]
                print(f"Создана ВРЕМЕННАЯ сессия для всех фото: {session_id_int}")
        
        results = []
        model = WasteDetector.get_model()
        
        for image in images:
            ext = image.name.split('.')[-1]
            unique_name = f"{uuid.uuid4()}.{ext}"
            
            upload_path = os.path.join(settings.MEDIA_ROOT, 'uploads', unique_name)
            result_path = os.path.join(settings.MEDIA_ROOT, 'results', unique_name)
            
            os.makedirs(os.path.dirname(upload_path), exist_ok=True)
            with open(upload_path, 'wb') as f:
                f.write(image.read())
            
            gps_data = extract_gps_from_image(upload_path)
            
            detections = model(upload_path, conf=0.2)
            waste_count = 0
            result_image_path = None
            
            if detections and len(detections) > 0:
                os.makedirs(os.path.dirname(result_path), exist_ok=True)
                detections[0].save(result_path)
                boxes = detections[0].boxes
                waste_count = len(boxes) if boxes else 0
                result_image_path = f'/media/results/{unique_name}'
            
            with connection.cursor() as cursor:
                if gps_data:
                    cursor.execute("""
                        INSERT INTO snapshots 
                        (filename, original_image_path, result_image_path, waste_count, location, session_id_fk)
                        VALUES (%s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s)
                        RETURNING id
                    """, [
                        unique_name,
                        f'/media/uploads/{unique_name}',
                        result_image_path,
                        waste_count,
                        gps_data['lon'],
                        gps_data['lat'],
                        session_id_int
                    ])
                else:
                    cursor.execute("""
                        INSERT INTO snapshots 
                        (filename, original_image_path, result_image_path, waste_count, location, session_id_fk)
                        VALUES (%s, %s, %s, %s, NULL, %s)
                        RETURNING id
                    """, [
                        unique_name,
                        f'/media/uploads/{unique_name}',
                        result_image_path,
                        waste_count,
                        session_id_int
                    ])
                
                snapshot_id = cursor.fetchone()[0]
            
            results.append({
                'snapshot_id': snapshot_id,
                'filename': unique_name,
                'original_url': f'/media/uploads/{unique_name}',
                'result_url': result_image_path,
                'waste_count': waste_count,
                'has_gps': bool(gps_data),
                'latitude': gps_data['lat'] if gps_data else None,
                'longitude': gps_data['lon'] if gps_data else None,
                'session_id_fk': session_id_int
            })
        
        print(f"Возвращаем session_id_fk: {session_id_int}")
        
        return Response({
            'session_id_fk': session_id_int,
            'results': results,
            'total_snapshots': len(results)
        }, status=status.HTTP_200_OK)


class UpdateSessionView(APIView):
    """Обновление сессии (название, приватность)"""
    permission_classes = [AllowAny]
    
    def patch(self, request, session_id):
        user_id = request.data.get('user_id')
        title = request.data.get('title')
        privacy = request.data.get('privacy')
        
        with connection.cursor() as cursor:
            # Проверяем, существует ли сессия и принадлежит ли пользователю
            cursor.execute("""
                SELECT user_id FROM sessions WHERE id = %s
            """, [session_id])
            result = cursor.fetchone()
            
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            if int(result[0]) != int(user_id):
                return Response({'error': 'Нет прав для изменения этой сессии'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            # Формируем UPDATE запрос
            updates = []
            params = []
            
            if title:
                updates.append("title = %s")
                params.append(title)
            
            if privacy:
                if privacy not in ['public', 'private']:
                    return Response({'error': 'Неверный тип приватности'}, 
                                  status=status.HTTP_400_BAD_REQUEST)
                updates.append("privacy = %s")
                params.append(privacy)
            
            if not updates:
                return Response({'error': 'Нет данных для обновления'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            params.append(session_id)
            
            query = f"""
                UPDATE sessions 
                SET {', '.join(updates)}
                WHERE id = %s
                RETURNING id, title, privacy
            """
            
            cursor.execute(query, params)
            updated = cursor.fetchone()
        
        return Response({
            'id': updated[0],
            'title': updated[1],
            'privacy': updated[2],
            'message': 'Сессия обновлена успешно'
        }, status=status.HTTP_200_OK)


class SnapshotsListView(APIView):
    """Получение списка снимков"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        session_id_fk = request.query_params.get('session_id_fk')
        limit = int(request.query_params.get('limit', 50))
        offset = int(request.query_params.get('offset', 0))
        
        query = """
            SELECT 
                id, filename, original_image_path, 
                result_image_path, waste_count, session_id_fk,
                ST_Y(location::geometry) as latitude,
                ST_X(location::geometry) as longitude
            FROM snapshots 
            WHERE 1=1
        """
        params = []
        
        if session_id_fk:
            query += " AND session_id_fk = %s"
            params.append(session_id_fk)
        
        query += " ORDER BY id DESC LIMIT %s OFFSET %s"
        params.extend([limit, offset])
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            snapshots = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return Response({
            'snapshots': snapshots,
            'count': len(snapshots),
            'limit': limit,
            'offset': offset
        })


class SnapshotDetailView(APIView):
    """Детальная информация о снимке и обновление session_id_fk"""
    permission_classes = [AllowAny]
    
    def get(self, request, snapshot_id):
        try:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT 
                        id, filename, original_image_path, 
                        result_image_path, waste_count, session_id_fk,
                        ST_Y(location::geometry) as latitude,
                        ST_X(location::geometry) as longitude
                    FROM snapshots 
                    WHERE id = %s
                """, [snapshot_id])
                
                row = cursor.fetchone()
                
                if not row:
                    return Response({'error': 'Снимок не найден'}, status=status.HTTP_404_NOT_FOUND)
                
                columns = ['id', 'filename', 'original_image_path', 
                          'result_image_path', 'waste_count', 'session_id_fk',
                          'latitude', 'longitude']
                
                snapshot = dict(zip(columns, row))
                
                return Response(snapshot)
                
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def patch(self, request, snapshot_id):
        """Обновление session_id_fk для привязки снимка к сессии"""
        session_id_fk = request.data.get('session_id_fk')
        
        if not session_id_fk:
            return Response({'error': 'session_id_fk обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                UPDATE snapshots 
                SET session_id_fk = %s 
                WHERE id = %s
                RETURNING id
            """, [session_id_fk, snapshot_id])
            
            if cursor.rowcount == 0:
                return Response({'error': 'Снимок не найден'}, 
                              status=status.HTTP_404_NOT_FOUND)
        
        return Response({
            'snapshot_id': snapshot_id,
            'session_id_fk': session_id_fk,
            'message': 'Снимок привязан к сессии'
        })


class CreateSessionView(APIView):
    """Создание новой сессии"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        user_id = request.data.get('user_id')
        title = request.data.get('title')
        privacy = request.data.get('privacy', 'private')
        
        if not user_id or not title:
            return Response({'error': 'user_id и title обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        if privacy not in ['public', 'private']:
            return Response({'error': 'Неверный тип приватности. Допустимые: public, private'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            session_uuid = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO sessions (user_id, title, session_id, privacy, cleanup_status, created_at)
                VALUES (%s, %s, %s, %s, 'pending', NOW())
                RETURNING id, session_id
            """, [user_id, title, session_uuid, privacy])
            
            session = cursor.fetchone()
            session_db_id = session[0]
            session_uuid_from_db = session[1]
            
            return Response({
                'id': session_db_id,
                'session_uuid': session_uuid_from_db,
                'privacy': privacy,
                'cleanup_status': 'pending',
                'message': 'Сессия создана успешно'
            }, status=status.HTTP_201_CREATED)


class GetSessionsView(APIView):
    """Получение сессий пользователя"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        limit = int(request.query_params.get('limit', 50))
        offset = int(request.query_params.get('offset', 0))
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        query = """
            SELECT 
                s.id,
                s.user_id,
                s.title,
                s.session_id,
                s.privacy,
                s.created_at,
                s.cleanup_status,
                COALESCE(
                    (SELECT COUNT(*) FROM snapshots WHERE session_id_fk = s.id),
                    0
                ) as total_snapshots,
                COALESCE(
                    (SELECT SUM(waste_count) FROM snapshots WHERE session_id_fk = s.id),
                    0
                ) as total_waste_count
            FROM sessions s
            WHERE s.user_id = %s
            ORDER BY s.created_at DESC
            LIMIT %s OFFSET %s
        """
        params = [user_id, limit, offset]
        
        with connection.cursor() as cursor:
            cursor.execute(query, params)
            columns = [col[0] for col in cursor.description]
            sessions = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            for session in sessions:
                if session.get('created_at'):
                    session['created_at'] = session['created_at'].isoformat() if hasattr(session['created_at'], 'isoformat') else session['created_at']
        
        return Response({
            'sessions': sessions,
            'count': len(sessions),
            'limit': limit,
            'offset': offset
        })


class GetSessionDetailView(APIView):
    """Детальная информация о сессии"""
    permission_classes = [AllowAny]
    
    def get(self, request, session_id):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    s.id,
                    s.user_id,
                    s.title,
                    s.session_id,
                    s.privacy,
                    s.created_at,
                    s.cleanup_status,
                    u.login as user_login,
                    COALESCE(
                        (SELECT COUNT(*) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_snapshots,
                    COALESCE(
                        (SELECT SUM(waste_count) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_waste_count
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.id = %s
            """, [session_id])
            
            session_row = cursor.fetchone()
            if not session_row:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            session_dict = {
                'id': session_row[0],
                'user_id': session_row[1],
                'title': session_row[2],
                'session_uuid': session_row[3],
                'privacy': session_row[4],
                'created_at': session_row[5].isoformat() if session_row[5] else None,
                'cleanup_status': session_row[6],
                'user_login': session_row[7],
                'total_snapshots': session_row[8] or 0,
                'total_waste_count': session_row[9] or 0
            }
            
            # ИСПРАВЛЕНО: получаем снимки сессии с правильными полями
            cursor.execute("""
                SELECT 
                    id, 
                    filename, 
                    original_image_path, 
                    result_image_path,
                    waste_count,
                    CAST(ST_Y(location::geometry) AS FLOAT) as latitude,
                    CAST(ST_X(location::geometry) AS FLOAT) as longitude
                FROM snapshots
                WHERE session_id_fk = %s
                ORDER BY id DESC
            """, [session_id])
            
            snapshots = []
            for row in cursor.fetchall():
                # Проверяем, есть ли координаты
                lat = row[5] if row[5] is not None else None
                lon = row[6] if row[6] is not None else None
                has_gps = lat is not None and lon is not None
                
                snapshots.append({
                    'id': row[0],
                    'filename': row[1],
                    'original_image_path': row[2],
                    'result_image_path': row[3],
                    'waste_count': row[4],
                    'latitude': lat,
                    'longitude': lon,
                    'has_gps': has_gps,
                    'status': 'processed'  # или значение из БД, если есть
                })
            
            session_dict['snapshots'] = snapshots
            
            return Response(session_dict)


class UpdateSessionCleanupStatusView(APIView):
    """Обновление статуса очистки сессии (только для автора)"""
    permission_classes = [AllowAny]
    
    def patch(self, request, session_id):
        user_id = request.data.get('user_id')
        new_status = request.data.get('cleanup_status')
        
        # Исправлено: используем 'cleaned' вместо 'completed'
        if not user_id or new_status not in ['cleaned', 'pending']:
            return Response({'error': 'user_id и cleanup_status (cleaned/pending) обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT user_id FROM sessions WHERE id = %s
            """, [session_id])
            result = cursor.fetchone()
            
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            if int(result[0]) != int(user_id):
                return Response({'error': 'Только автор может менять статус очистки'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            cursor.execute("""
                UPDATE sessions 
                SET cleanup_status = %s
                WHERE id = %s
                RETURNING id
            """, [new_status, session_id])
        
        return Response({
            'session_id': session_id,
            'cleanup_status': new_status,
            'message': f'Статус очистки изменен на {new_status}'
        })


class DeleteSessionView(APIView):
    """Удаление сессии (только для автора)"""
    permission_classes = [AllowAny]
    
    def delete(self, request, session_id):
        user_id = request.data.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT user_id FROM sessions WHERE id = %s
            """, [session_id])
            result = cursor.fetchone()
            
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            if int(result[0]) != int(user_id):
                return Response({'error': 'Нет прав для удаления этой сессии'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            # Сначала удаляем связанные снимки (из-за NOT NULL ограничения)
            cursor.execute("DELETE FROM snapshots WHERE session_id_fk = %s", [session_id])
            
            # Затем удаляем сессию
            cursor.execute("DELETE FROM sessions WHERE id = %s", [session_id])
        
        return Response({
            'message': 'Сессия успешно удалена'
        }, status=status.HTTP_200_OK)


class GetPublicSessionsView(APIView):
    """Получение публичных сессий для ленты"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        limit = int(request.query_params.get('limit', 50))
        offset = int(request.query_params.get('offset', 0))
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    s.id,
                    s.user_id,
                    u.login as user_login,
                    s.title,
                    s.session_id,
                    s.created_at,
                    s.cleanup_status,
                    COALESCE(
                        (SELECT COUNT(*) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_snapshots,
                    COALESCE(
                        (SELECT SUM(waste_count) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_waste_count,
                    (SELECT original_image_path FROM snapshots WHERE session_id_fk = s.id ORDER BY id LIMIT 1) as cover_image
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.privacy = 'public'
                ORDER BY s.created_at DESC
                LIMIT %s OFFSET %s
            """, [limit, offset])
            
            columns = [col[0] for col in cursor.description]
            sessions = []
            for row in cursor.fetchall():
                session = dict(zip(columns, row))
                if session.get('created_at'):
                    session['created_at'] = session['created_at'].isoformat() if hasattr(session['created_at'], 'isoformat') else session['created_at']
                sessions.append(session)
            
            return Response({
                'sessions': sessions,
                'count': len(sessions),
                'limit': limit,
                'offset': offset
            })


class GetPublicSessionsMapView(APIView):
    """Получение координат фотографий публичных сессий для карты"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    s.id as session_id,
                    s.title,
                    ss.id as snapshot_id,
                    ST_Y(ss.location::geometry) as lat,
                    ST_X(ss.location::geometry) as lon,
                    ss.waste_count
                FROM sessions s
                JOIN snapshots ss ON s.id = ss.session_id_fk
                WHERE s.privacy = 'public' 
                    AND s.cleanup_status != 'cleaned'
                    AND ss.location IS NOT NULL
                ORDER BY s.created_at DESC
            """)
            
            columns = [col[0] for col in cursor.description]
            snapshots = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            return Response({'snapshots': snapshots})


class CheckUserActiveView(APIView):
    """Проверка активности пользователя"""
    permission_classes = [AllowAny]
    
    def get(self, request, user_id):
        with connection.cursor() as cursor:
            cursor.execute("SELECT is_active FROM users WHERE id = %s", [user_id])
            result = cursor.fetchone()
            is_active = result[0] if result else False
        
        return Response({'is_active': is_active})


class AdminUsersView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    u.id, u.login, u.email, u.role, u.is_active,
                    COALESCE(
                        (SELECT COUNT(*) FROM sessions WHERE user_id = u.id),
                        0
                    ) as total_sessions,
                    COALESCE(
                        (SELECT COUNT(*) FROM snapshots ss 
                         JOIN sessions s ON ss.session_id_fk = s.id 
                         WHERE s.user_id = u.id),
                        0
                    ) as total_snapshots,
                    COALESCE(
                        (SELECT SUM(ss.waste_count) FROM snapshots ss 
                         JOIN sessions s ON ss.session_id_fk = s.id 
                         WHERE s.user_id = u.id),
                        0
                    ) as total_waste_items
                FROM users u
                ORDER BY u.id
            """)
            columns = [col[0] for col in cursor.description]
            users = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return Response({'users': users})


class AdminUpdateUserRoleView(APIView):
    permission_classes = [AllowAny]
    
    def patch(self, request, user_id):
        new_role = request.data.get('role')
        admin_id = request.data.get('admin_id')
        
        # Добавляем 'banned' в список допустимых ролей
        if new_role not in ['user', 'moderator', 'admin', 'banned']:
            return Response({'error': 'Неверная роль'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            admin_role = cursor.fetchone()
            if not admin_role or admin_role[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("UPDATE users SET role = %s WHERE id = %s", [new_role, user_id])
        
        return Response({'message': 'Роль обновлена'})


class AdminToggleUserView(APIView):
    """Блокировка/разблокировка пользователя (устарело, используйте updateUserRole)"""
    permission_classes = [AllowAny]
    
    def patch(self, request, user_id):
        admin_id = request.data.get('admin_id')
        action = request.data.get('action')  # 'ban' or 'unban'
        reason = request.data.get('reason', '')
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            admin_role = cursor.fetchone()
            if not admin_role or admin_role[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("SELECT role FROM users WHERE id = %s", [user_id])
            result = cursor.fetchone()
            if not result:
                return Response({'error': 'Пользователь не найден'}, status=404)
            
            current_role = result[0]
            
            if action == 'ban':
                new_role = 'banned'
                # Сохраняем причину блокировки
                cursor.execute("""
                    UPDATE users SET role = %s, blocked_reason = %s WHERE id = %s
                """, ['banned', reason, user_id])
            else:
                new_role = 'user'  # разблокируем как обычного пользователя
                cursor.execute("""
                    UPDATE users SET role = %s, blocked_reason = NULL WHERE id = %s
                """, ['user', user_id])
            
            return Response({
                'message': f'Пользователь {"заблокирован" if action == "ban" else "разблокирован"}',
                'role': new_role
            })


class AdminStatsView(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) FROM users")
            total_users = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM users WHERE is_active = true")
            active_users = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM users WHERE is_active = false")
            blocked_users = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM sessions")
            total_sessions = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM snapshots")
            total_snapshots = cursor.fetchone()[0]
            
            cursor.execute("SELECT COALESCE(SUM(waste_count), 0) FROM snapshots")
            total_waste = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM cleanup_requests WHERE status = 'pending'")
            pending_requests = cursor.fetchone()[0]
        
        return Response({
            'total_users': total_users,
            'active_users': active_users,
            'blocked_users': blocked_users,
            'total_sessions': total_sessions,
            'total_snapshots': total_snapshots,
            'total_waste': total_waste,
            'pending_requests': pending_requests
        })
    
class UpdateSessionPrivacyView(APIView):
    """Обновление приватности сессии"""
    permission_classes = [AllowAny]
    
    def patch(self, request, session_id):
        user_id = request.data.get('user_id')
        privacy = request.data.get('privacy')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        if privacy not in ['public', 'private']:
            return Response({'error': 'Неверный тип приватности. Допустимые: public, private'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Проверяем, существует ли сессия и принадлежит ли пользователю
            cursor.execute("""
                SELECT user_id FROM sessions WHERE id = %s
            """, [session_id])
            result = cursor.fetchone()
            
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            if int(result[0]) != int(user_id):
                return Response({'error': 'Нет прав для изменения этой сессии'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            cursor.execute("""
                UPDATE sessions 
                SET privacy = %s
                WHERE id = %s
                RETURNING id, privacy
            """, [privacy, session_id])
            
            updated = cursor.fetchone()
        
        return Response({
            'id': updated[0],
            'privacy': updated[1],
            'message': f'Приватность сессии изменена на {privacy}'
        }, status=status.HTTP_200_OK)
    
# views.py
class GetPublicSessionsForMapView(APIView):
    """Возвращает сессии для карты (одна точка на сессию)"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT DISTINCT ON (s.id)
                    s.id as session_id,
                    s.title,
                    COALESCE((
                        SELECT SUM(waste_count) 
                        FROM snapshots 
                        WHERE session_id_fk = s.id
                    ), 0) as total_waste_count,
                    ST_Y(ss.location::geometry) as lat,
                    ST_X(ss.location::geometry) as lon
                FROM sessions s
                JOIN snapshots ss ON s.id = ss.session_id_fk
                WHERE s.privacy = 'public' 
                    AND s.cleanup_status != 'cleaned'
                    AND ss.location IS NOT NULL
                ORDER BY s.id, ss.id
            """)
            
            sessions = []
            for row in cursor.fetchall():
                sessions.append({
                    'session_id': row[0],
                    'title': row[1],
                    'total_waste_count': row[2],
                    'lat': float(row[3]) if row[3] else None,
                    'lon': float(row[4]) if row[4] else None
                })
            
            # Фильтруем те, у которых есть координаты
            sessions = [s for s in sessions if s['lat'] and s['lon']]
            
            return Response({'sessions': sessions})
        
# Добавьте в views.py:

class GetMyCleanupRequestsView(APIView):
    """Получение заявок на очистку, созданных пользователем"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    cr.id,
                    cr.session_id,
                    s.title as session_title,
                    cr.requester_user_id,
                    u.login as requester_login,
                    cr.status,
                    cr.verification_photos,
                    cr.comment,
                    cr.created_at
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                JOIN users u ON cr.requester_user_id = u.id
                WHERE cr.requester_user_id = %s
                ORDER BY cr.created_at DESC
            """, [user_id])
            
            columns = [col[0] for col in cursor.description]
            requests = []
            for row in cursor.fetchall():
                req = dict(zip(columns, row))
                # Преобразуем массив PostgreSQL в список Python
                if req.get('verification_photos'):
                    req['verification_photos'] = list(req['verification_photos']) if req['verification_photos'] else []
                else:
                    req['verification_photos'] = []
                requests.append(req)
            
            return Response({'requests': requests})


class ResolveCleanupRequestView(APIView):
    """Подтверждение или отклонение заявки на очистку (только для автора сессии)"""
    permission_classes = [AllowAny]
    
    def post(self, request, request_id):
        user_id = request.data.get('user_id')
        action = request.data.get('action')  # 'approve' or 'reject'
        
        if not user_id or action not in ['approve', 'reject']:
            return Response({'error': 'user_id и action (approve/reject) обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Получаем информацию о заявке и сессии
            cursor.execute("""
                SELECT cr.id, cr.session_id, s.user_id as session_owner_id, cr.status
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                WHERE cr.id = %s
            """, [request_id])
            
            result = cursor.fetchone()
            if not result:
                return Response({'error': 'Заявка не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            request_db_id, session_id, session_owner_id, current_status = result
            
            # Проверяем, что пользователь - автор сессии
            if int(session_owner_id) != int(user_id):
                return Response({'error': 'Только автор сессии может обрабатывать заявки'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            # Проверяем, что заявка ещё не обработана
            if current_status != 'pending':
                return Response({'error': 'Эта заявка уже обработана'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            new_status = 'approved' if action == 'approve' else 'rejected'
            
            # Обновляем статус заявки (БЕЗ resolved_at и resolution_comment)
            cursor.execute("""
                UPDATE cleanup_requests 
                SET status = %s
                WHERE id = %s
                RETURNING id
            """, [new_status, request_id])
            
            # Если заявка одобрена, обновляем статус сессии
            if action == 'approve':
                cursor.execute("""
                    UPDATE sessions 
                    SET cleanup_status = 'cleaned'
                    WHERE id = %s
                """, [session_id])
            
            return Response({
                'message': f'Заявка {new_status}',
                'request_id': request_id,
                'new_status': new_status
            }, status=status.HTTP_200_OK)


class GetSessionCleanupRequestsView(APIView):
    """Получение заявок на очистку для конкретной сессии (для автора)"""
    permission_classes = [AllowAny]
    
    def get(self, request, session_id):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Проверяем, что пользователь - автор сессии
            cursor.execute("SELECT user_id FROM sessions WHERE id = %s", [session_id])
            result = cursor.fetchone()
            
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            if int(result[0]) != int(user_id):
                return Response({'error': 'Нет доступа к заявкам этой сессии'}, 
                              status=status.HTTP_403_FORBIDDEN)
            
            cursor.execute("""
                SELECT 
                    cr.id,
                    cr.session_id,
                    s.title as session_title,
                    cr.requester_user_id,
                    u.login as requester_login,
                    cr.status,
                    cr.verification_photos,
                    cr.comment,
                    cr.created_at
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                JOIN users u ON cr.requester_user_id = u.id
                WHERE cr.session_id = %s
                ORDER BY cr.created_at DESC
            """, [session_id])
            
            columns = [col[0] for col in cursor.description]
            requests = []
            for row in cursor.fetchall():
                req = dict(zip(columns, row))
                if req.get('verification_photos'):
                    req['verification_photos'] = list(req['verification_photos']) if req['verification_photos'] else []
                else:
                    req['verification_photos'] = []
                requests.append(req)
            
            return Response({'requests': requests})
        
class RequestCleanupView(APIView):
    """Создание заявки на очистку сессии"""
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request, session_id):
        user_id = request.data.get('user_id')
        comment = request.data.get('comment', '')
        verification_photos = request.FILES.getlist('verification_photos')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Проверяем, существует ли сессия
            cursor.execute("""
                SELECT s.user_id, s.cleanup_status, u.login 
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.id = %s
            """, [session_id])
            
            result = cursor.fetchone()
            if not result:
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            session_owner_id, cleanup_status, owner_login = result
            
            # Нельзя отправить заявку на свою сессию
            if int(session_owner_id) == int(user_id):
                return Response({'error': 'Нельзя отправить заявку на свою сессию'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            # Нельзя отправить заявку на уже очищенную сессию
            if cleanup_status == 'cleaned':
                return Response({'error': 'Эта сессия уже отмечена как очищенная'}, 
                              status=status.HTTP_400_BAD_REQUEST)
            
            # Сохраняем фотографии
            photo_paths = []
            for photo in verification_photos:
                ext = photo.name.split('.')[-1]
                unique_name = f"cleanup_{uuid.uuid4()}.{ext}"
                upload_path = os.path.join(settings.MEDIA_ROOT, 'cleanup_photos', unique_name)
                os.makedirs(os.path.dirname(upload_path), exist_ok=True)
                
                with open(upload_path, 'wb') as f:
                    for chunk in photo.chunks():
                        f.write(chunk)
                
                photo_paths.append(f'/media/cleanup_photos/{unique_name}')
            
            # Создаем заявку
            cursor.execute("""
                INSERT INTO cleanup_requests 
                (session_id, requester_user_id, status, comment, verification_photos, created_at)
                VALUES (%s, %s, 'pending', %s, %s, NOW())
                RETURNING id
            """, [session_id, user_id, comment, photo_paths])
            
            request_id = cursor.fetchone()[0]
        
        return Response({
            'request_id': request_id,
            'session_id': session_id,
            'message': 'Заявка на очистку успешно отправлена'
        }, status=status.HTTP_201_CREATED)
    
class GetRequestsForUserView(APIView):
    """Получение заявок на очистку, адресованных пользователю (для его сессий)"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    cr.id,
                    cr.session_id,
                    s.title as session_title,
                    cr.requester_user_id,
                    u.login as requester_login,
                    cr.status,
                    cr.verification_photos,
                    cr.comment,
                    cr.created_at
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                JOIN users u ON cr.requester_user_id = u.id
                WHERE s.user_id = %s  -- ЗДЕСЬ: владелец сессии = текущий пользователь
                ORDER BY cr.created_at DESC
            """, [user_id])
            
            columns = [col[0] for col in cursor.description]
            requests = []
            for row in cursor.fetchall():
                req = dict(zip(columns, row))
                if req.get('verification_photos'):
                    req['verification_photos'] = list(req['verification_photos']) if req['verification_photos'] else []
                else:
                    req['verification_photos'] = []
                requests.append(req)
            
            return Response({'requests': requests})
        

# ========== АДМИНСКИЕ ЭНДПОИНТЫ ДЛЯ СЕССИЙ ==========

class AdminSessionsView(APIView):
    """Получение всех сессий для админа"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        admin_id = request.query_params.get('admin_id')
        
        # Проверяем, что пользователь админ
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("""
                SELECT 
                    s.id,
                    s.user_id,
                    u.login as user_login,
                    s.title,
                    s.privacy,
                    s.cleanup_status,
                    s.created_at,
                    COALESCE(
                        (SELECT COUNT(*) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_snapshots,
                    COALESCE(
                        (SELECT SUM(waste_count) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_waste_count
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                ORDER BY s.created_at DESC
            """)
            
            columns = [col[0] for col in cursor.description]
            sessions = []
            for row in cursor.fetchall():
                session = dict(zip(columns, row))
                sessions.append(session)
            
            return Response({'sessions': sessions})


class AdminCleanupRequestsView(APIView):
    """Получение всех заявок на очистку для админа"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        admin_id = request.query_params.get('admin_id')
        
        if not admin_id:
            return Response({'error': 'admin_id обязателен'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("""
                SELECT 
                    cr.id,
                    cr.session_id,
                    s.title as session_title,
                    cr.requester_user_id,
                    u.login as requester_login,
                    cr.status,
                    cr.verification_photos,
                    cr.comment,
                    cr.created_at
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                JOIN users u ON cr.requester_user_id = u.id
                ORDER BY cr.created_at DESC
            """)
            
            columns = [col[0] for col in cursor.description]
            requests = []
            for row in cursor.fetchall():
                req = dict(zip(columns, row))
                # ВАЖНО: преобразуем массив PostgreSQL в список Python
                if req.get('verification_photos'):
                    # Если это строка, преобразуем в список
                    if isinstance(req['verification_photos'], str):
                        req['verification_photos'] = [req['verification_photos']]
                    else:
                        req['verification_photos'] = list(req['verification_photos']) if req['verification_photos'] else []
                else:
                    req['verification_photos'] = []
                requests.append(req)
            
            pending_count = len([r for r in requests if r['status'] == 'pending'])
            
            return Response({'requests': requests, 'pending_count': pending_count})


class AdminResolveCleanupRequestView(APIView):
    """Админское решение по заявке на очистку"""
    permission_classes = [AllowAny]
    
    def post(self, request, request_id):
        admin_id = request.data.get('admin_id')
        action = request.data.get('action')
        
        if not admin_id or action not in ['approve', 'reject']:
            return Response({'error': 'admin_id и action обязательны'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            # Получаем информацию о заявке
            cursor.execute("""
                SELECT cr.session_id, cr.status, s.user_id
                FROM cleanup_requests cr
                JOIN sessions s ON cr.session_id = s.id
                WHERE cr.id = %s
            """, [request_id])
            
            row = cursor.fetchone()
            if not row:
                return Response({'error': 'Заявка не найдена'}, status=404)
            
            session_id, current_status, session_owner_id = row
            
            if current_status != 'pending':
                return Response({'error': 'Заявка уже обработана'}, status=400)
            
            new_status = 'approved' if action == 'approve' else 'rejected'
            
            # Обновляем статус заявки
            cursor.execute("""
                UPDATE cleanup_requests 
                SET status = %s
                WHERE id = %s
            """, [new_status, request_id])
            
            # Если одобрена, обновляем статус сессии
            if action == 'approve':
                cursor.execute("""
                    UPDATE sessions 
                    SET cleanup_status = 'cleaned'
                    WHERE id = %s
                """, [session_id])
            
            return Response({'message': f'Заявка {new_status}', 'request_id': request_id})


class AdminReportsView(APIView):
    """Получение всех жалоб для админа"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        admin_id = request.query_params.get('admin_id')
        
        if not admin_id:
            return Response({'error': 'admin_id обязателен'}, status=400)
        
        with connection.cursor() as cursor:
            # Проверяем, что пользователь админ
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            # Убираем resolved_at и resolution_comment, оставляем только resolved_by
            cursor.execute("""
                SELECT 
                    r.id,
                    r.session_id,
                    COALESCE(s.title, 'Удаленная сессия') as session_title,
                    s.user_id as session_owner_id,
                    COALESCE(u_owner.login, 'Неизвестный') as session_owner_login,
                    r.reporter_user_id,
                    COALESCE(u_reporter.login, 'Неизвестный') as reporter_login,
                    r.reason,
                    r.comment,
                    r.status,
                    r.created_at,
                    r.resolved_by,
                    COALESCE(u_resolver.login, '') as resolved_by_login
                FROM reports r
                LEFT JOIN sessions s ON r.session_id = s.id
                LEFT JOIN users u_owner ON s.user_id = u_owner.id
                LEFT JOIN users u_reporter ON r.reporter_user_id = u_reporter.id
                LEFT JOIN users u_resolver ON r.resolved_by = u_resolver.id
                ORDER BY r.created_at DESC
            """)
            
            columns = [col[0] for col in cursor.description]
            reports = []
            for row in cursor.fetchall():
                report = dict(zip(columns, row))
                reports.append(report)
            
            pending_count = len([r for r in reports if r['status'] == 'pending'])
            
            return Response({'reports': reports, 'pending_count': pending_count})
        
class GetCleanedSessionsView(APIView):
    """Получение очищенных сессий пользователя"""
    permission_classes = [AllowAny]
    
    def get(self, request):
        user_id = request.query_params.get('user_id')
        
        if not user_id:
            return Response({'error': 'user_id обязателен'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT 
                    s.id,
                    s.user_id,
                    s.title,
                    s.privacy,
                    s.cleanup_status,
                    s.created_at,
                    COALESCE(
                        (SELECT COUNT(*) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_snapshots,
                    COALESCE(
                        (SELECT SUM(waste_count) FROM snapshots WHERE session_id_fk = s.id),
                        0
                    ) as total_waste_count
                FROM sessions s
                WHERE s.user_id = %s AND s.cleanup_status = 'cleaned'
                ORDER BY s.created_at DESC
            """, [user_id])
            
            columns = [col[0] for col in cursor.description]
            sessions = [dict(zip(columns, row)) for row in cursor.fetchall()]
            
            total_cleaned = len(sessions)
            total_waste_cleaned = sum(s.get('total_waste_count', 0) for s in sessions)
            
            return Response({
                'sessions': sessions,
                'total_cleaned': total_cleaned,
                'total_waste_cleaned': total_waste_cleaned
            })
        
# Добавьте эти классы в views.py, если их нет:

class AdminUpdateSessionCleanupView(APIView):
    """Админское обновление статуса очистки сессии"""
    permission_classes = [AllowAny]
    
    def patch(self, request, session_id):
        admin_id = request.data.get('admin_id')
        new_status = request.data.get('cleanup_status')
        
        if not admin_id or new_status not in ['cleaned', 'pending']:
            return Response({'error': 'admin_id и cleanup_status (cleaned/pending) обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("""
                UPDATE sessions 
                SET cleanup_status = %s
                WHERE id = %s
                RETURNING id
            """, [new_status, session_id])
            
            if cursor.rowcount == 0:
                return Response({'error': 'Сессия не найдена'}, status=404)
        
        return Response({
            'session_id': session_id,
            'cleanup_status': new_status,
            'message': f'Статус очистки изменен на {new_status}'
        })


class AdminDeleteSessionView(APIView):
    """Админское удаление сессии"""
    permission_classes = [AllowAny]
    
    def delete(self, request, session_id):
        admin_id = request.data.get('admin_id')
        
        if not admin_id:
            return Response({'error': 'admin_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("SELECT id FROM sessions WHERE id = %s", [session_id])
            if not cursor.fetchone():
                return Response({'error': 'Сессия не найдена'}, status=404)
            
            cursor.execute("UPDATE snapshots SET session_id_fk = NULL WHERE session_id_fk = %s", [session_id])
            cursor.execute("DELETE FROM sessions WHERE id = %s", [session_id])
        
        return Response({'message': 'Сессия успешно удалена'}, status=status.HTTP_200_OK)
    
class AdminUpdateSessionCleanupView(APIView):

    permission_classes = [AllowAny]
    
    def patch(self, request, session_id):
        admin_id = request.data.get('admin_id')
        new_status = request.data.get('cleanup_status')
        
        if not admin_id or new_status not in ['cleaned', 'pending']:
            return Response({'error': 'admin_id и cleanup_status (cleaned/pending) обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            cursor.execute("""
                UPDATE sessions 
                SET cleanup_status = %s
                WHERE id = %s
                RETURNING id
            """, [new_status, session_id])
            
            if cursor.rowcount == 0:
                return Response({'error': 'Сессия не найдена'}, status=404)
        
        return Response({
            'session_id': session_id,
            'cleanup_status': new_status,
            'message': f'Статус очистки изменен на {new_status}'
        })


class AdminDeleteSessionView(APIView):
    """Админское удаление сессии"""
    permission_classes = [AllowAny]
    
    def delete(self, request, session_id):
        admin_id = request.data.get('admin_id')
        
        if not admin_id:
            return Response({'error': 'admin_id обязателен'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] != 'admin':
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            # Проверяем, существует ли сессия
            cursor.execute("SELECT id FROM sessions WHERE id = %s", [session_id])
            if not cursor.fetchone():
                return Response({'error': 'Сессия не найдена'}, status=404)
            
            # Сначала удаляем связанные снимки (из-за NOT NULL ограничения)
            cursor.execute("DELETE FROM snapshots WHERE session_id_fk = %s", [session_id])
            
            # Затем удаляем сессию
            cursor.execute("DELETE FROM sessions WHERE id = %s", [session_id])
        
        return Response({'message': 'Сессия и все связанные снимки успешно удалены'}, status=status.HTTP_200_OK)
    
class CreateReportView(APIView):
    """Создание жалобы на сессию"""
    permission_classes = [AllowAny]
    
    def post(self, request):
        session_id = request.data.get('session_id')
        user_id = request.data.get('user_id')  # reporter_user_id
        reason = request.data.get('reason')
        comment = request.data.get('comment', '')
        
        if not session_id or not user_id or not reason:
            return Response({'error': 'session_id, user_id и reason обязательны'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        if reason not in ['spam', 'inappropriate', 'fake', 'other']:
            return Response({'error': 'Неверная причина жалобы'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        with connection.cursor() as cursor:
            # Проверяем, существует ли сессия
            cursor.execute("SELECT id FROM sessions WHERE id = %s", [session_id])
            if not cursor.fetchone():
                return Response({'error': 'Сессия не найдена'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            # Создаем жалобу
            cursor.execute("""
                INSERT INTO reports 
                (session_id, reporter_user_id, reason, comment, status, created_at)
                VALUES (%s, %s, %s, %s, 'pending', NOW())
                RETURNING id
            """, [session_id, user_id, reason, comment])
            
            report_id = cursor.fetchone()[0]
        
        return Response({
            'report_id': report_id,
            'session_id': session_id,
            'message': 'Жалоба успешно отправлена'
        }, status=status.HTTP_201_CREATED)
    
class AdminResolveReportView(APIView):
    """Админское/модераторское решение по жалобе"""
    permission_classes = [AllowAny]
    
    def post(self, request, report_id):
        admin_id = request.data.get('admin_id')
        action = request.data.get('action')
        
        if not admin_id or action not in ['resolve', 'reject']:
            return Response({'error': 'admin_id и action обязательны'}, status=400)
        
        with connection.cursor() as cursor:
            cursor.execute("SELECT role FROM users WHERE id = %s", [admin_id])
            result = cursor.fetchone()
            if not result or result[0] not in ['admin', 'moderator']:
                return Response({'error': 'Доступ запрещен'}, status=403)
            
            # Получаем информацию о жалобе и сессии
            cursor.execute("""
                SELECT r.session_id, r.status, s.user_id, s.title
                FROM reports r
                JOIN sessions s ON r.session_id = s.id
                WHERE r.id = %s
            """, [report_id])
            
            row = cursor.fetchone()
            if not row:
                return Response({'error': 'Жалоба не найдена'}, status=404)
            
            session_id, current_status, session_owner_id, session_title = row
            
            if current_status != 'pending':
                return Response({'error': 'Жалоба уже обработана'}, status=400)
            
            new_status = 'resolved' if action == 'resolve' else 'rejected'
            
            # Обновляем статус жалобы
            cursor.execute("""
                UPDATE reports 
                SET status = %s, resolved_by = %s
                WHERE id = %s
            """, [new_status, admin_id, report_id])
            
            # ЕСЛИ ЖАЛОБА ПОДТВЕРЖДЕНА - УДАЛЯЕМ СЕССИЮ
            if action == 'resolve':
                # Сначала удаляем связанные снимки (из-за NOT NULL ограничения)
                cursor.execute("DELETE FROM snapshots WHERE session_id_fk = %s", [session_id])
                # Затем удаляем сессию
                cursor.execute("DELETE FROM sessions WHERE id = %s", [session_id])
            
            return Response({
                'message': f'Жалоба {new_status}',
                'report_id': report_id,
                'new_status': new_status,
                'session_id': session_id,
                'session_title': session_title
            })
        
class GetUserInfoView(APIView):
    """Получение полной информации о пользователе"""
    permission_classes = [AllowAny]
    
    def get(self, request, user_id):
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT id, login, email, role, is_active, blocked_reason
                FROM users 
                WHERE id = %s
            """, [user_id])
            
            row = cursor.fetchone()
            if not row:
                return Response({'error': 'Пользователь не найден'}, 
                              status=status.HTTP_404_NOT_FOUND)
            
            return Response({
                'id': row[0],
                'login': row[1],
                'email': row[2],
                'role': row[3],
                'is_active': row[4],
                'blocked_reason': row[5]
            })