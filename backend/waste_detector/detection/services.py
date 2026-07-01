# detection/services.py
import os
from ultralytics import YOLO
from django.conf import settings

class WasteDetector:
    _instance = None
    _model = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            # Загружаем модель один раз
            model_path = os.path.join(settings.BASE_DIR, 'best.pt')
            cls._model = YOLO(model_path)
        return cls._instance
    
    def detect(self, image_path, conf=0.25):
        """Детекция мусора на изображении"""
        results = self._model(image_path, conf=conf)
        
        if results and len(results) > 0:
            boxes = results[0].boxes
            count = len(boxes) if boxes else 0
            
            # Сохраняем результат
            result_path = image_path.replace('uploads', 'results')
            results[0].save(result_path)
            
            return {
                'result_path': result_path,
                'waste_count': count,
                'boxes': boxes.data.tolist() if boxes else []
            }
        
        return None