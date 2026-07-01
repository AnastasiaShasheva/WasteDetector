from rest_framework import serializers

# Определяем Enum классы для валидации
class DetectionStatus:
    PENDING = 'pending'
    VERIFIED = 'verified'
    CLEANING = 'cleaning'
    CLEANED = 'cleaned'
    REJECTED = 'rejected'
    ARCHIVED = 'archived'
    
    CHOICES = [
        (PENDING, 'pending'),
        (VERIFIED, 'verified'),
        (CLEANING, 'cleaning'),
        (CLEANED, 'cleaned'),
        (REJECTED, 'rejected'),
        (ARCHIVED, 'archived'),
    ]

class UserRole:
    USER = 'user'
    MODERATOR = 'moderator'
    ADMIN = 'admin'
    
    CHOICES = [
        (USER, 'user'),
        (MODERATOR, 'moderator'),
        (ADMIN, 'admin'),
    ]

class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    login = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=255)
    role = serializers.ChoiceField(choices=UserRole.CHOICES, default=UserRole.USER)
    is_active = serializers.BooleanField(default=True)

class UserCreateSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=100)
    email = serializers.EmailField(max_length=255)
    password = serializers.CharField(min_length=6, write_only=True)

class UserLoginSerializer(serializers.Serializer):
    login = serializers.CharField(max_length=100)
    password = serializers.CharField()

class DetectionSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    user_id = serializers.IntegerField(allow_null=True, required=False)
    username = serializers.CharField(max_length=100)
    filename = serializers.CharField(max_length=255)
    original_image_path = serializers.CharField()
    result_image_path = serializers.CharField(allow_null=True, required=False)
    waste_count = serializers.IntegerField(min_value=0)
    has_gps = serializers.BooleanField(default=False)
    latitude = serializers.FloatField(allow_null=True, required=False)
    longitude = serializers.FloatField(allow_null=True, required=False)
    status = serializers.ChoiceField(choices=DetectionStatus.CHOICES, default=DetectionStatus.PENDING)
    session_id = serializers.UUIDField(allow_null=True, required=False)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    processed_at = serializers.DateTimeField(allow_null=True, required=False)

class DetectionCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=100)
    filename = serializers.CharField(max_length=255)
    original_image_path = serializers.CharField()
    result_image_path = serializers.CharField(allow_null=True, required=False)
    waste_count = serializers.IntegerField(min_value=0)
    latitude = serializers.FloatField(allow_null=True, required=False)
    longitude = serializers.FloatField(allow_null=True, required=False)
    status = serializers.ChoiceField(choices=DetectionStatus.CHOICES, default=DetectionStatus.PENDING)

class DetectionUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DetectionStatus.CHOICES)