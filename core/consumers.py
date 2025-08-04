import json
from channels.generic.websocket import AsyncWebsocketConsumer
from core.mqtt_service import mqtt_service

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("game_updates", self.channel_name)
        await self.accept()
        print("WebSocket connected")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("game_updates", self.channel_name)
        print("WebSocket disconnected")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data["type"] == "gun_control":
                player_id = int(data["player_id"])
                enabled = bool(data["enabled"])
                
                # Publish to MQTT
                mqtt_service.publish_gun_control(player_id, enabled)
                
                await self.channel_layer.group_send(
                    "game_updates",
                    {
                        "type": "game_update",
                        "data": {
                            "type": "gun_control",
                            "player_id": player_id,
                            "enabled": enabled
                        }
                    }
                )
        
        except Exception as e:
            print(f"Error in WebSocket receive: {e}")

    async def game_update(self, event):
        """Handle game updates from MQTT service"""
        await self.send(text_data=json.dumps(event['data']))