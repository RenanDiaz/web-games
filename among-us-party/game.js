// Game State
let gameState = {
    pin: '',
    players: [],
    impostorCount: 1,
    currentRound: 1,
    roles: {}, // { playerName: 'impostor' | 'crewmate' }
    checkedPlayers: [], // Players who have checked their role this round
    scores: {
        crewmateWins: 0,
        impostorWins: 0
    },
    playerStats: {}, // { playerName: { timesImpostor: 0, timesCrewmate: 0, winsAsImpostor: 0, winsAsCrewmate: 0 } }
    roundHistory: [] // [{ round: 1, winner: 'crewmates', impostors: ['name1', 'name2'] }]
};

// DOM Elements
const screens = {
    setup: document.getElementById('setup-screen'),
    roleCheck: document.getElementById('role-check-screen'),
    roundEnd: document.getElementById('round-end-screen'),
    scoreboard: document.getElementById('scoreboard-screen')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadGameState();
    setupEventListeners();
    renderPlayerList();
});

function setupEventListeners() {
    // Add player on Enter key
    document.getElementById('new-player').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addPlayer();
        }
    });

    // PIN entry on Enter key
    document.getElementById('check-pin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            revealRole();
        }
    });

    // Game PIN on Enter key
    document.getElementById('game-pin').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('new-player').focus();
        }
    });
}

// Screen Navigation
function showScreen(screenName) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenName].classList.add('active');
}

// Player Management
function addPlayer() {
    const input = document.getElementById('new-player');
    const name = input.value.trim();

    if (!name) return;

    if (gameState.players.includes(name)) {
        alert('This player is already added!');
        return;
    }

    gameState.players.push(name);

    // Initialize player stats if new
    if (!gameState.playerStats[name]) {
        gameState.playerStats[name] = {
            timesImpostor: 0,
            timesCrewmate: 0,
            winsAsImpostor: 0,
            winsAsCrewmate: 0
        };
    }

    input.value = '';
    input.focus();
    renderPlayerList();
    saveGameState();
}

function removePlayer(name) {
    gameState.players = gameState.players.filter(p => p !== name);
    renderPlayerList();
    saveGameState();
}

function renderPlayerList() {
    const container = document.getElementById('player-list');
    container.innerHTML = gameState.players.map(name => `
        <span class="player-tag">
            ${escapeHtml(name)}
            <span class="remove" onclick="removePlayer('${escapeHtml(name)}')">&times;</span>
        </span>
    `).join('');
}

// Game Start
function startGame() {
    const pin = document.getElementById('game-pin').value;
    const impostorCount = parseInt(document.getElementById('impostor-count').value);

    // Validation
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
        alert('Please enter a 4-digit PIN');
        return;
    }

    if (gameState.players.length < 3) {
        alert('You need at least 3 players to start');
        return;
    }

    if (impostorCount >= gameState.players.length) {
        alert('Too many impostors for the number of players');
        return;
    }

    gameState.pin = pin;
    gameState.impostorCount = impostorCount;

    assignRoles();
    showRoleCheckScreen();
    saveGameState();
}

// Role Assignment
function assignRoles() {
    // Shuffle players array
    const shuffled = [...gameState.players].sort(() => Math.random() - 0.5);

    // Reset roles
    gameState.roles = {};
    gameState.checkedPlayers = [];

    // Assign impostors
    for (let i = 0; i < shuffled.length; i++) {
        const isImpostor = i < gameState.impostorCount;
        const playerName = shuffled[i];
        gameState.roles[playerName] = isImpostor ? 'impostor' : 'crewmate';

        // Update stats
        if (isImpostor) {
            gameState.playerStats[playerName].timesImpostor++;
        } else {
            gameState.playerStats[playerName].timesCrewmate++;
        }
    }
}

// Role Check Screen
function showRoleCheckScreen() {
    showScreen('roleCheck');
    document.getElementById('round-number').textContent = gameState.currentRound;
    renderPlayerButtons();
    updateCheckedCount();
    resetRoleCheckUI();
}

function renderPlayerButtons() {
    const container = document.getElementById('player-buttons');
    container.innerHTML = gameState.players.map(name => {
        const isChecked = gameState.checkedPlayers.includes(name);
        return `
            <button class="player-btn ${isChecked ? 'checked' : ''}"
                    onclick="selectPlayer('${escapeHtml(name)}')"
                    ${isChecked ? 'disabled' : ''}>
                ${escapeHtml(name)}
            </button>
        `;
    }).join('');
}

let selectedPlayer = null;

function selectPlayer(name) {
    if (gameState.checkedPlayers.includes(name)) return;

    selectedPlayer = name;
    document.getElementById('player-selection').classList.add('hidden');
    document.getElementById('pin-entry').classList.remove('hidden');
    document.getElementById('selected-player-name').textContent = name;
    document.getElementById('check-pin').value = '';
    document.getElementById('check-pin').focus();
}

function cancelPinEntry() {
    selectedPlayer = null;
    resetRoleCheckUI();
}

function resetRoleCheckUI() {
    document.getElementById('player-selection').classList.remove('hidden');
    document.getElementById('pin-entry').classList.add('hidden');
    document.getElementById('role-reveal').classList.add('hidden');
}

function revealRole() {
    const enteredPin = document.getElementById('check-pin').value;

    if (enteredPin !== gameState.pin) {
        alert('Wrong PIN! Try again.');
        document.getElementById('check-pin').value = '';
        return;
    }

    const role = gameState.roles[selectedPlayer];
    const roleDisplay = document.getElementById('role-display');

    if (role === 'impostor') {
        // Get other impostors
        const otherImpostors = Object.entries(gameState.roles)
            .filter(([name, r]) => r === 'impostor' && name !== selectedPlayer)
            .map(([name]) => name);

        let hint = 'Eliminate the crewmates without getting caught!';
        if (otherImpostors.length > 0) {
            hint = `Your fellow impostor${otherImpostors.length > 1 ? 's' : ''}: ${otherImpostors.join(', ')}`;
        }

        roleDisplay.className = 'role-display impostor';
        roleDisplay.innerHTML = `
            <span class="role-icon-large">🔪</span>
            <span class="role-name">Impostor</span>
            <p class="role-hint">${hint}</p>
        `;
    } else {
        roleDisplay.className = 'role-display crewmate';
        roleDisplay.innerHTML = `
            <span class="role-icon-large">👨‍🚀</span>
            <span class="role-name">Crewmate</span>
            <p class="role-hint">Complete your tasks and find the impostor!</p>
        `;
    }

    document.getElementById('pin-entry').classList.add('hidden');
    document.getElementById('role-reveal').classList.remove('hidden');

    // Mark player as checked
    if (!gameState.checkedPlayers.includes(selectedPlayer)) {
        gameState.checkedPlayers.push(selectedPlayer);
        saveGameState();
    }
}

function hideRole() {
    selectedPlayer = null;
    resetRoleCheckUI();
    renderPlayerButtons();
    updateCheckedCount();
}

function updateCheckedCount() {
    const count = gameState.checkedPlayers.length;
    const total = gameState.players.length;
    document.getElementById('checked-count').textContent = `${count}/${total} players checked`;
}

// Round End
function showRoundEnd() {
    showScreen('roundEnd');
    document.getElementById('end-round-number').textContent = gameState.currentRound;

    // Show impostors
    const impostors = Object.entries(gameState.roles)
        .filter(([_, role]) => role === 'impostor')
        .map(([name]) => name);

    document.getElementById('impostor-names').innerHTML = impostors
        .map(name => `<span class="player-tag">${escapeHtml(name)}</span>`)
        .join('');
}

function recordWin(winner) {
    // Get impostors for this round
    const impostors = Object.entries(gameState.roles)
        .filter(([_, role]) => role === 'impostor')
        .map(([name]) => name);

    // Update team scores
    if (winner === 'crewmates') {
        gameState.scores.crewmateWins++;

        // Update individual stats
        gameState.players.forEach(name => {
            if (gameState.roles[name] === 'crewmate') {
                gameState.playerStats[name].winsAsCrewmate++;
            }
        });
    } else {
        gameState.scores.impostorWins++;

        // Update individual stats
        impostors.forEach(name => {
            gameState.playerStats[name].winsAsImpostor++;
        });
    }

    // Add to round history
    gameState.roundHistory.push({
        round: gameState.currentRound,
        winner: winner,
        impostors: impostors
    });

    saveGameState();
    showScoreboard();
}

// Scoreboard
function showScoreboard() {
    showScreen('scoreboard');
    renderScoreboard();
}

function showScoreboardFromGame() {
    showScreen('roleCheck');
}

function renderScoreboard() {
    // Team scores
    document.getElementById('crewmate-wins').textContent = gameState.scores.crewmateWins;
    document.getElementById('impostor-wins').textContent = gameState.scores.impostorWins;

    // Player stats
    const statsContainer = document.getElementById('player-stats');
    statsContainer.innerHTML = gameState.players.map(name => {
        const stats = gameState.playerStats[name];
        return `
            <div class="player-stat-row">
                <span class="player-stat-name">${escapeHtml(name)}</span>
                <div class="player-stat-details">
                    <span class="stat-impostor">🔪 ${stats.winsAsImpostor}/${stats.timesImpostor}</span>
                    <span class="stat-crewmate">👨‍🚀 ${stats.winsAsCrewmate}/${stats.timesCrewmate}</span>
                </div>
            </div>
        `;
    }).join('');

    // Round history
    const historyContainer = document.getElementById('round-history');
    historyContainer.innerHTML = gameState.roundHistory.slice().reverse().map(round => `
        <div class="round-history-item">
            <strong>Round ${round.round}:</strong>
            <span class="round-winner ${round.winner}">${round.winner === 'crewmates' ? '👨‍🚀 Crewmates' : '🔪 Impostors'} won</span>
            <br><small>Impostors: ${round.impostors.join(', ')}</small>
        </div>
    `).join('');

    if (gameState.roundHistory.length === 0) {
        historyContainer.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No rounds played yet</p>';
    }
}

function startNewRound() {
    gameState.currentRound++;
    assignRoles();
    showRoleCheckScreen();
    saveGameState();
}

function resetGame() {
    if (!confirm('Are you sure you want to reset the entire game? All scores will be lost.')) {
        return;
    }

    gameState = {
        pin: gameState.pin, // Keep the PIN
        players: gameState.players, // Keep the players
        impostorCount: gameState.impostorCount,
        currentRound: 1,
        roles: {},
        checkedPlayers: [],
        scores: {
            crewmateWins: 0,
            impostorWins: 0
        },
        playerStats: {},
        roundHistory: []
    };

    // Reinitialize player stats
    gameState.players.forEach(name => {
        gameState.playerStats[name] = {
            timesImpostor: 0,
            timesCrewmate: 0,
            winsAsImpostor: 0,
            winsAsCrewmate: 0
        };
    });

    saveGameState();
    showScreen('setup');
    document.getElementById('game-pin').value = gameState.pin;
}

// Persistence
function saveGameState() {
    try {
        localStorage.setItem('amongUsPartyGame', JSON.stringify(gameState));
    } catch (e) {
        console.warn('Could not save game state:', e);
    }
}

function loadGameState() {
    try {
        const saved = localStorage.getItem('amongUsPartyGame');
        if (saved) {
            const loaded = JSON.parse(saved);
            gameState = { ...gameState, ...loaded };

            // Restore UI state
            if (gameState.pin) {
                document.getElementById('game-pin').value = gameState.pin;
            }
            if (gameState.impostorCount) {
                document.getElementById('impostor-count').value = gameState.impostorCount;
            }

            // If we have an active game, go to the role check screen
            if (gameState.currentRound > 0 && Object.keys(gameState.roles).length > 0) {
                showRoleCheckScreen();
            }
        }
    } catch (e) {
        console.warn('Could not load game state:', e);
    }
}

// Utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
