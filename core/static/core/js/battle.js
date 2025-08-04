// Game state management
const gameState = {
    players: {
        1: { hp: 3, maxHp: 3 },
        2: { hp: 3, maxHp: 3 },
        3: { hp: 3, maxHp: 3 },
        4: { hp: 3, maxHp: 3 },
        5: { hp: 3, maxHp: 3 },
        6: { hp: 3, maxHp: 3 },
        7: { hp: 3, maxHp: 3 },
        8: { hp: 3, maxHp: 3 }
    }
};

// Function to update player HP with heart animations
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

// Function to reset game
function resetGame() {
    console.log('Resetting game');
    Object.keys(gameState.players).forEach(playerId => {
        updatePlayerHP(parseInt(playerId), 3, true);
    });
}

// WebSocket connection
let socket;

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/game/`;
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = function(e) {
        console.log('WebSocket connected');
    };
    
    socket.onmessage = function(e) {
        const data = JSON.parse(e.data);
        handleGameUpdate(data);
    };
    
    socket.onclose = function(e) {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(initWebSocket, 3000);
    };
    
    socket.onerror = function(e) {
        console.error('WebSocket error:', e);
    };
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
        default:
            console.warn('Unknown game update type:', data.type);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    console.log('Battle Arena initialized with MQTT integration - 8 players with heart-based HP!');
});