// Game state management
const gameState = {
    players: {
        1: { hp: 5, maxHp: 5 },
        2: { hp: 5, maxHp: 5 },
        3: { hp: 5, maxHp: 5 },
        4: { hp: 5, maxHp: 5 },
        5: { hp: 5, maxHp: 5 },
        6: { hp: 5, maxHp: 5 }
    }
};

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

// Function to update player HP
function updatePlayerHP(playerId, newHp) {
    const player = gameState.players[playerId];
    if (!player) return;

    const oldHp = player.hp;
    player.hp = Math.max(0, Math.min(newHp, player.maxHp));
    
    const playerElement = document.getElementById(`player-${playerId}`);
    const hpFill = playerElement.querySelector('.hp-fill');
    const hpText = playerElement.querySelector('.hp-text');
    
    // Update HP bar and text
    const hpPercentage = (player.hp / player.maxHp) * 100;
    hpFill.style.width = `${hpPercentage}%`;
    hpText.textContent = `${player.hp}/${player.maxHp}`;
    
    // Remove existing status classes
    playerElement.classList.remove('critical', 'dead', 'damaged');
    
    // Add appropriate status class
    if (player.hp === 0) {
        playerElement.classList.add('dead');
    } else if (player.hp <= 1) {
        playerElement.classList.add('critical');
    } else if (player.hp < oldHp) {
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
    updatePlayerHP(playerId, player.hp - damage);
}

// Function to heal player
function healPlayer(playerId, healAmount) {
    const player = gameState.players[playerId];
    if (!player) return;
    
    console.log(`Player ${playerId} heals for ${healAmount} HP`);
    updatePlayerHP(playerId, player.hp + healAmount);
}

// Function to reset game
function resetGame() {
    console.log('Resetting game');
    Object.keys(gameState.players).forEach(playerId => {
        updatePlayerHP(parseInt(playerId), 5);
    });
}

// Initialize WebSocket connection when page loads
document.addEventListener('DOMContentLoaded', function() {
    initWebSocket();
    console.log('Battle Arena initialized with MQTT integration!');
});