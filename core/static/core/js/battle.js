// Game state management
const gameState = {
    players: {
        1: { hp: 3, maxHp: 3, gunEnabled: true },
        2: { hp: 3, maxHp: 3, gunEnabled: true },
        3: { hp: 3, maxHp: 3, gunEnabled: true },
        4: { hp: 3, maxHp: 3, gunEnabled: true },
        5: { hp: 3, maxHp: 3, gunEnabled: true },
        6: { hp: 3, maxHp: 3, gunEnabled: true },
        7: { hp: 3, maxHp: 3, gunEnabled: true },
        8: { hp: 3, maxHp: 3, gunEnabled: true }
    }
};

// Function to send gun control commands via WebSocket
function sendGunCommand(playerId, enabled) {
    if (wsConnectionFailed) {
        console.log(`🔫 Gun ${enabled ? 'enabled' : 'disabled'} for player ${playerId} (offline mode)`);
        return;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        const command = {
            type: 'gun_control',
            player_id: playerId,
            enabled: enabled
        };
        try {
            socket.send(JSON.stringify(command));
            console.log(`🔫 Gun ${enabled ? 'enabled' : 'disabled'} for player ${playerId}`);
        } catch (error) {
            console.error('❌ Error sending gun command:', error);
        }
    } else {
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateText = socket ? states[socket.readyState] : 'null';
        console.warn(`⚠️ Cannot send gun command - WebSocket not connected (state: ${stateText})`);
    }
}

// Function to update player HP with heart animations and gun control
function updatePlayerHP(playerId, newHp, isHealing = false) {
    const player = gameState.players[playerId];
    if (!player) return;

    const oldHp = player.hp;
    player.hp = Math.max(0, Math.min(newHp, player.maxHp));
    
    const playerElement = document.getElementById(`player-${playerId}`);
    const hearts = playerElement.querySelectorAll('.heart');
    
    // Remove existing status classes
    playerElement.classList.remove('critical', 'dead', 'damaged');
    
    // Update hearts display
    hearts.forEach((heart, index) => {
        heart.classList.remove('lost', 'healing', 'damage');
        
        if (index < player.hp) {
            // Heart is active
            if (isHealing && index >= oldHp) {
                // This heart was just healed
                heart.classList.add('healing');
                setTimeout(() => heart.classList.remove('healing'), 600);
            }
        } else {
            // Heart is lost
            heart.classList.add('lost');
            if (!isHealing && index < oldHp) {
                // This heart was just lost
                heart.classList.add('damage');
                setTimeout(() => heart.classList.remove('damage'), 500);
            }
        }
    });
    
    // Handle gun control based on HP
    if (player.hp === 0 && player.gunEnabled) {
        // Player died - disable gun
        player.gunEnabled = false;
        sendGunCommand(playerId, false);
    } else if (player.hp > 0 && !player.gunEnabled && isHealing) {
        // Player was revived - enable gun
        player.gunEnabled = true;
        sendGunCommand(playerId, true);
    }
    
    // Add appropriate player status class
    if (player.hp === 0) {
        playerElement.classList.add('dead');
    } else if (player.hp === 1) {
        playerElement.classList.add('critical');
    } else if (player.hp < oldHp && !isHealing) {
        playerElement.classList.add('damaged');
        // Remove damaged class after animation
        setTimeout(() => {
            playerElement.classList.remove('damaged');
        }, 300);
    }
}

// Function to apply damage
function applyDamage(playerId, damage) {
    const player = gameState.players[playerId];
    if (!player) return;
    
    console.log(`Player ${playerId} takes ${damage} damage`);
    updatePlayerHP(playerId, player.hp - damage, false);
}

// Function to heal player
function healPlayer(playerId, healAmount) {
    const player = gameState.players[playerId];
    if (!player) return;
    
    console.log(`Player ${playerId} heals for ${healAmount} HP`);
    updatePlayerHP(playerId, player.hp + healAmount, true);
}

// Function to reset game and enable all guns
function resetGameAndGuns() {
    console.log('🔄 Resetting game and enabling all guns');
    
    // Reset all players HP and enable guns
    Object.keys(gameState.players).forEach(playerId => {
        const player = gameState.players[playerId];
        player.gunEnabled = true;
        updatePlayerHP(parseInt(playerId), 3, true);
        sendGunCommand(parseInt(playerId), true);
    });
    
    // Send reset command via WebSocket to sync with backend
    if (wsConnectionFailed) {
        console.log('📤 Reset completed (offline mode)');
        return;
    }
    
    if (socket && socket.readyState === WebSocket.OPEN) {
        try {
            socket.send(JSON.stringify({
                type: 'reset_game'
            }));
            console.log('📤 Reset command sent to backend');
        } catch (error) {
            console.error('❌ Error sending reset command:', error);
        }
    } else {
        const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        const stateText = socket ? states[socket.readyState] : 'null';
        console.warn(`⚠️ Cannot send reset command - WebSocket not connected (state: ${stateText})`);
    }
}

// Function to reset game (from MQTT)
function resetGame() {
    console.log('Resetting game from MQTT');
    Object.keys(gameState.players).forEach(playerId => {
        const player = gameState.players[playerId];
        player.gunEnabled = true;
        updatePlayerHP(parseInt(playerId), 3, true);
    });
}

// WebSocket connection
let socket;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
let wsConnectionFailed = false;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/game/`;
    
    console.log(`🔗 Attempting WebSocket connection to: ${wsUrl}`);
    console.log(`🌍 Current location: ${window.location.href}`);
    console.log(`🔒 Protocol: ${window.location.protocol}, Host: ${window.location.host}`);
    
    try {
        socket = new WebSocket(wsUrl);
        
        socket.onopen = function(e) {
            console.log('✅ WebSocket connected successfully');
            wsConnectionFailed = false;
            reconnectAttempts = 0;
        };
        
        socket.onmessage = function(e) {
            try {
                const data = JSON.parse(e.data);
                console.log('📨 WebSocket message received:', data);
                handleGameUpdate(data);
            } catch (error) {
                console.error('❌ Error parsing WebSocket message:', error, 'Raw data:', e.data);
            }
        };
        
        socket.onclose = function(e) {
            console.log(`🔌 WebSocket disconnected.`);
            console.log(`   Code: ${e.code}`);
            console.log(`   Reason: ${e.reason || 'No reason provided'}`);
            console.log(`   Clean close: ${e.wasClean}`);
            
            // Common close codes explained
            const closeCodes = {
                1000: 'Normal closure',
                1001: 'Going away',
                1002: 'Protocol error',
                1003: 'Unsupported data',
                1006: 'Abnormal closure (no close frame)',
                1011: 'Server error',
                1012: 'Service restart',
                1013: 'Try again later',
                1014: 'Bad gateway',
                1015: 'TLS handshake failure'
            };
            
            if (closeCodes[e.code]) {
                console.log(`   Meaning: ${closeCodes[e.code]}`);
            }
            
            if (reconnectAttempts < maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`🔄 Attempting reconnection ${reconnectAttempts}/${maxReconnectAttempts} in 3 seconds...`);
                setTimeout(initWebSocket, 3000);
            } else {
                console.error('❌ Max reconnection attempts reached.');
                wsConnectionFailed = true;
                showConnectionError();
            }
        };
        
        socket.onerror = function(e) {
            console.error('❌ WebSocket error occurred:');
            console.error('   Socket URL:', socket.url);
            console.error('   Socket Protocol:', socket.protocol);
            console.error('   Ready State:', socket.readyState);
            console.error('   Error Object:', e);
            console.error('   Error Type:', e.type);
            console.error('   Error Target:', e.target);
            
            // Try to get more error details
            if (e.target && e.target.readyState) {
                const states = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
                console.error('   Target State:', states[e.target.readyState]);
            }
        };
        
    } catch (error) {
        console.error('❌ Failed to create WebSocket:', error);
        wsConnectionFailed = true;
        showConnectionError();
    }
}

// Show connection error message
function showConnectionError() {
    console.warn('⚠️ Running in offline mode - WebSocket features disabled');
    
    // You could add a visual indicator here
    const battleStatus = document.querySelector('.battle-timer');
    if (battleStatus) {
        battleStatus.textContent = 'OFFLINE MODE';
        battleStatus.style.color = '#ff6b6b';
    }
}

// Handle game updates from MQTT
function handleGameUpdate(data) {
    console.log('Game update received:', data);
    
    switch(data.type) {
        case 'damage':
            applyDamage(data.player_id, data.damage);
            break;
        case 'heal':
            healPlayer(data.player_id, data.heal);
            break;
        case 'reset':
            resetGame();
            break;
        case 'gun_control':
            // Handle gun control updates from server if needed
            console.log(`Gun control update: Player ${data.player_id} gun ${data.enabled ? 'enabled' : 'disabled'}`);
            break;
        default:
            console.warn('Unknown game update type:', data.type);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    console.log('Battle Arena initialized with MQTT integration - 8 players with heart-based HP!');
});