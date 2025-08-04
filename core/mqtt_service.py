import paho.mqtt.client as mqtt
import json
import logging
from django.conf import settings
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)

class MQTTService:
    def __init__(self):
        self.client = None
        self.channel_layer = get_channel_layer()
        
    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected to MQTT broker")
            # Subscribe to damage commands
            client.subscribe("command/damage/+")
            client.subscribe("command/heal/+")
            client.subscribe("command/reset")
        else:
            logger.error(f"Failed to connect to MQTT broker: {rc}")
    
    def on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = msg.payload.decode('utf-8')
            
            logger.info(f"MQTT message received - Topic: {topic}, Payload: {payload}")
            
            # Parse topic
            topic_parts = topic.split('/')
            
            if len(topic_parts) == 3 and topic_parts[0] == "command":
                command = topic_parts[1]
                player_id = int(topic_parts[2])
                
                if command == "damage":
                    damage = int(payload)
                    self.send_to_websocket({
                        'type': 'damage',
                        'player_id': player_id,
                        'damage': damage
                    })
                    
                elif command == "heal":
                    heal_amount = int(payload)
                    self.send_to_websocket({
                        'type': 'heal',
                        'player_id': player_id,
                        'heal': heal_amount
                    })
                    
            elif topic == "command/reset":
                self.send_to_websocket({
                    'type': 'reset'
                })
                
        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")
    
    def send_to_websocket(self, data):
        """Send data to WebSocket consumers"""
        if self.channel_layer:
            async_to_sync(self.channel_layer.group_send)(
                "game_updates",
                {
                    "type": "game_update",
                    "data": data
                }
            )
    
    def connect(self):
        if not settings.ENABLE_MQTT:
            logger.info("MQTT is disabled")
            return
            
        try:
            self.client = mqtt.Client()
            self.client.on_connect = self.on_connect
            self.client.on_message = self.on_message
            
            # Set credentials if provided
            if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
                self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)
            
            self.client.connect(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, 60)
            self.client.loop_start()
            
            logger.info("MQTT service started")
            
        except Exception as e:
            logger.error(f"Failed to start MQTT service: {e}")
    
    def disconnect(self):
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            logger.info("MQTT service stopped")

    def publish_gun_control(self, player_id, enabled):
        if self.client:
            topic = f"control/gun/{player_id}"
            payload = json.dumps({"enabled": enabled})
            self.client.publish(topic, payload)
            logger.info(f"Published gun control to hardware: Player {player_id} - {'ENABLED' if enabled else 'DISABLED'}")
        else:
            logger.warning("MQTT client not initialized. Cannot publish gun control.")

# Global instance
mqtt_service = MQTTService()