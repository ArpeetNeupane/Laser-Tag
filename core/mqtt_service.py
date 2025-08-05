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
        self.last_message_ids = {}  # Track recent messages to prevent duplicates
        self.published_reset_ids = set()  # Track our own reset message IDs

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected to MQTT broker")
            # Subscribe to damage commands
            client.subscribe("command/damage/+")
            client.subscribe("command/heal/+")
            client.subscribe("command/reset")  # Hardware can send reset commands here
            # Also subscribe to control/reset for debugging (optional)
            # client.subscribe("control/reset")
        else:
            logger.error(f"Failed to connect to MQTT broker: {rc}")

    def on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = msg.payload.decode("utf-8")

            logger.info(f"MQTT message received - Topic: {topic}, Payload: {payload}")

            # Create a message ID for deduplication
            import time

            message_id = f"{topic}:{payload}:{int(time.time())}"

            # Check for duplicate messages within 1 second
            current_time = time.time()
            if topic in self.last_message_ids:
                last_time, last_payload = self.last_message_ids[topic]
                if current_time - last_time < 1.0 and last_payload == payload:
                    logger.warning(f"Ignoring duplicate message: {topic} - {payload}")
                    return

            # Store this message
            self.last_message_ids[topic] = (current_time, payload)

            # Parse topic
            topic_parts = topic.split("/")

            if len(topic_parts) == 3 and topic_parts[0] == "command":
                command = topic_parts[1]
                player_id = int(topic_parts[2])

                if command == "damage":
                    # Parse payload to get damage amount, default to 1 if not provided
                    damage = 1
                    try:
                        if payload.strip():
                            payload_data = json.loads(payload)
                            damage = payload_data.get("damage", 1)
                    except (json.JSONDecodeError, ValueError):
                        # If payload is not JSON or invalid, treat as simple damage=1
                        damage = 1

                    logger.info(
                        f"Processing damage: Player {player_id} takes {damage} damage"
                    )
                    self.send_to_websocket(
                        {"type": "damage", "player_id": player_id, "damage": damage}
                    )

                elif command == "heal":
                    # Parse payload to get heal amount, default to 1 if not provided
                    heal_amount = 1
                    try:
                        if payload.strip():
                            payload_data = json.loads(payload)
                            heal_amount = payload_data.get("heal", 1)
                    except (json.JSONDecodeError, ValueError):
                        # If payload is not JSON or invalid, treat as simple heal=1
                        heal_amount = 1

                    logger.info(
                        f"Processing heal: Player {player_id} heals {heal_amount} HP"
                    )
                    self.send_to_websocket(
                        {"type": "heal", "player_id": player_id, "heal": heal_amount}
                    )

            elif topic == "command/reset":
                # Parse payload to check if this is our own reset message
                try:
                    payload_data = json.loads(payload)
                    reset_id = payload_data.get("id")

                    # If this reset has our ID, ignore it
                    if reset_id and reset_id in self.published_reset_ids:
                        logger.info(
                            "Ignoring self-published reset command to prevent loop"
                        )
                        self.published_reset_ids.discard(reset_id)  # Remove from set
                        return
                except (json.JSONDecodeError, ValueError):
                    # If payload is not JSON, it's likely from hardware
                    pass

                logger.info("Reset command received from MQTT hardware")
                self.send_to_websocket({"type": "reset"})

        except Exception as e:
            logger.error(f"Error processing MQTT message: {e}")

    def send_to_websocket(self, data):
        """Send data to WebSocket consumers"""
        if self.channel_layer:
            async_to_sync(self.channel_layer.group_send)(
                "game_updates", {"type": "game_update", "data": data}
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
                self.client.username_pw_set(
                    settings.MQTT_USERNAME, settings.MQTT_PASSWORD
                )

            self.client.connect(
                settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, 60
            )
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
            logger.info(
                f"Published gun control to hardware: Player {player_id} - {'ENABLED' if enabled else 'DISABLED'}"
            )
        else:
            logger.warning("MQTT client not initialized. Cannot publish gun control.")

    def publish_reset_command(self):
        if self.client:
            import uuid

            # Generate unique ID for this reset command
            reset_id = str(uuid.uuid4())
            self.published_reset_ids.add(reset_id)

            # Send reset command to hardware on the topic they expect
            topic = "command/reset"
            payload = json.dumps({"reset": True, "id": reset_id})
            self.client.publish(topic, payload)
            logger.info("Published reset command to hardware on topic: command/reset")

            # Clean up old IDs after a delay to prevent memory leaks
            import threading

            def cleanup():
                import time

                time.sleep(5)  # Wait 5 seconds
                self.published_reset_ids.discard(reset_id)

            threading.Thread(target=cleanup, daemon=True).start()

        else:
            logger.warning("MQTT client not initialized. Cannot publish reset command.")


# Global instance
mqtt_service = MQTTService()
