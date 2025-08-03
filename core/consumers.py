import json
from channels.generic.websocket import AsyncWebsocketConsumer

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.channel_layer.group_add("game_updates", self.channel_name)
        await self.accept()
        print("WebSocket connected")

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard("game_updates", self.channel_name)
        print("WebSocket disconnected")

    async def receive(self, text_data):
        # Handle messages from client if needed
        pass

    async def game_update(self, event):
        """Handle game updates from MQTT service"""
        await self.send(text_data=json.dumps(event['data']))