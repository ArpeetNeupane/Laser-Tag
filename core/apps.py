from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Start MQTT service when Django starts
        from core.mqtt_service import mqtt_service
        mqtt_service.connect()