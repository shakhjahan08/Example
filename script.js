(() => {
  'use strict';

  /* =========================
     HELPERS & ERROR DISPLAY
  ========================= */

  const $ = id => document.getElementById(id);
  const files = 'abcdefgh';

  const symbols = {
    w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
    b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
  };

  const themes = [
    ['royal', '#ead6b0', '#718e6b'],
    ['classic', '#f0d9b5', '#b58863'],
    ['ocean', '#d7eef2', '#39738a'],
    ['forest', '#e8e0b8', '#557b45'],
    ['neon', '#d8f8ff', '#3656a3']
  ];

  /* Display user-facing error banners */
  function showError(msg) {
    console.error('[Chess Error]:', msg);
    
    // Check if error banner container exists, create if missing
    let errBanner = $('errorBanner');
    if (!errBanner) {
      errBanner = document.createElement('div');
      errBanner.id = 'errorBanner';
      errBanner.style.cssText = `
        position: fixed;
        top: 12px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9999;
        background: #ff304f;
        color: #ffffff;
        padding: 12px 20px;
        border-radius: 10px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        font-weight: bold;
        font-size: 0.9rem;
        max-width: 90%;
        text-align: center;
        display: flex;
        align-items: center;
        gap: 10px;
      `;
      document.body.appendChild(errBanner);
    }

    errBanner.innerHTML = `⚠️ <span>${msg}</span>`;
    errBanner.style.display = 'flex';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      if (errBanner) errBanner.style.display = 'none';
    }, 5000);
  }

  /* Verify external dependencies are loaded */
  function checkDependencies() {
    const missing = [];
    if (typeof Chess === 'undefined') missing.push('Chess.js (game engine)');
    if (typeof Peer === 'undefined') missing.push('PeerJS (multiplayer network)');

    if (missing.length > 0) {
      const err = `Failed to load required libraries: ${missing.join(', ')}. Check CDN script tags in index.html.`;
      showError(err);
      setStatus('Library Load Error', 'mate');
      return false;
    }
    return true;
  }

  /* =========================
     STATE
  ========================= */

  let state = {
    name: localStorage.getItem('chessName') || 'Player',
    theme: localStorage.getItem('chessTheme') || 'royal',
    chess: null,
    selected: null,
    lastMove: null,
    flipped: false,
    peer: null,
    connection: null,
    host: false,
    room: null,
    color: null,
    opponentName: 'Waiting...'
  };

  /* =========================
     BASIC UI
  ========================= */

  function bind(id, fn) {
    const el = $(id);
    if (el) {
      el.addEventListener('click', fn);
    } else {
      console.warn(`[UI Warning]: Element #${id} not found in HTML.`);
    }
  }

  function show(id) { if ($(id))$(id).hidden = false; }
  function hide(id) { if ($(id))$(id).hidden = true; }

  function randomRoom() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  function setRoomStatus(text, online = false) {
    const el = $('roomStatus');
    if (el) {
      el.innerHTML = '<span class="connection-dot ' + (online ? 'online' : '') + '"></span>' + text;
    }
  }

  function setStatus(text, cls = '') {
    const el = $('status');
    if (el) {
      el.className = 'status ' + cls;
      el.innerHTML = '<span class="label">Game</span><span>' + text + '</span>';
    }
  }

  /* =========================
     SETTINGS
  ========================= */

  function applyTheme() {
    const theme = themes.find(t => t[0] === state.theme) || themes[0];
    document.documentElement.style.setProperty('--light', theme[1]);
    document.documentElement.style.setProperty('--dark', theme[2]);

    document.querySelectorAll('.theme').forEach(el => {
      el.classList.toggle('active', el.dataset.theme === state.theme);
    });
  }

  function profile() {
    if ($('playerName'))$('playerName').textContent = state.name;
    if ($('myName'))$('myName').textContent = state.name;
    if ($('myAvatar'))$('myAvatar').textContent = (state.name[0] || 'P').toUpperCase();
    if ($('nameInput'))$('nameInput').value = state.name;
    applyTheme();
    updatePlayerLabels();
  }

  function updatePlayerLabels() {
    if ($('myColorLabel'))$('myColorLabel').textContent = state.color === 'b' ? 'Black' : 'White';
    if ($('opponentColorLabel'))$('opponentColorLabel').textContent = state.color === 'b' ? 'White' : 'Black';
  }

  function buildThemes() {
    const grid = $('themeGrid');
    if (!grid) return;
    grid.innerHTML = '';

    themes.forEach(([key, a, b]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme';
      button.dataset.theme = key;
      button.innerHTML =
        '<div class="preview" style="--a:' + a + ';--b:' + b + '"></div>' +
        '<b>' + key.charAt(0).toUpperCase() + key.slice(1) + '</b>';

      button.onclick = () => {
        state.theme = key;
        applyTheme();
      };

      grid.appendChild(button);
    });
  }

  /* =========================
     ROOM UI & SHARE
  ========================= */

  function updateRoomUI() {
    const room = state.room || 'Not connected';
    if ($('roomDisplay'))$('roomDisplay').textContent = room;
    if ($('headerRoom'))$('headerRoom').textContent = room;

    const hasRoom = Boolean(state.room);
    if ($('shareBtn'))$('shareBtn').style.display = hasRoom ? 'inline-block' : 'none';
    if ($('headerShareBtn'))$('headerShareBtn').style.display = hasRoom ? 'inline-block' : 'none';

    if ($('whiteTurn'))$('whiteTurn').textContent = state.color === 'w' ? 'YOU' : '';
    if ($('blackTurn'))$('blackTurn').textContent = state.color === 'b' ? 'YOU' : '';

    updatePlayerLabels();
  }

  async function shareRoom() {
    if (!state.room) {
      showError('Create or join a room first before sharing.');
      return;
    }

    const shareData = {
      title: 'Royal Chess Online',
      text: `Join my chess game! Room ID: ${state.room}`
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Share failed:', err);
      }
    }

    try {
      await navigator.clipboard.writeText(state.room);
      setRoomStatus('Room ID copied to clipboard!');
    } catch {
      setRoomStatus(`Room ID: ${state.room}`);
    }
  }

  /* =========================
     CHESS STATUS & ANIMATIONS
  ========================= */

  function getKingSquare(color) {
    if (!state.chess) return null;
    const board = state.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === color) {
          return files[c] + (8 - r);
        }
      }
    }
    return null;
  }

  function updateStatus() {
    if (!state.chess) return;

    if (state.chess.in_checkmate()) {
      const winner = state.chess.turn() === 'w' ? 'Black' : 'White';
      setStatus('Checkmate — ' + winner + ' wins', 'mate');
      return;
    }

    if (state.chess.in_check()) {
      setStatus(
        'Check — ' + (state.chess.turn() === 'w' ? 'White' : 'Black') + ' is threatened',
        'check'
      );
      return;
    }

    if (state.chess.in_draw()) {
      setStatus('Draw');
      return;
    }

    if (!state.connection) {
      setStatus('Create or join a room to start');
      return;
    }

    if (!state.color) {
      setStatus('Waiting for connection...');
      return;
    }

    if (state.chess.turn() === state.color) {
      setStatus('Your turn');
    } else {
      setStatus((state.chess.turn() === 'w' ? 'White' : 'Black') + ' to move');
    }
  }

  function getSquareOffset(fromSq, toSq) {
    const fromCol = files.indexOf(fromSq[0]);
    const fromRow = 8 - parseInt(fromSq[1], 10);
    const toCol = files.indexOf(toSq[0]);
    const toRow = 8 - parseInt(toSq[1], 10);

    const boardEl = $('board');
    const boardWidth = boardEl ? boardEl.clientWidth : 400;
    const squareSize = boardWidth / 8;

    let dx = (fromCol - toCol) * squareSize;
    let dy = (fromRow - toRow) * squareSize;

    if (state.flipped) {
      dx = -dx;
      dy = -dy;
    }

    return { dx, dy };
  }

  /* =========================
     RENDER BOARD
  ========================= */

  function render() {
    const board = $('board');
    if (!board || !state.chess) return;

    board.innerHTML = '';
    board.classList.remove('checkmate-shake');

    if (state.chess.in_checkmate()) {
      void board.offsetWidth;
      board.classList.add('checkmate-shake');
    }

    const rows = state.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = state.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const data = state.chess.board();

    const checkColor = state.chess.in_check() || state.chess.in_checkmate() ? state.chess.turn() : null;
    const kingSquare = checkColor ? getKingSquare(checkColor) : null;

    rows.forEach(r => {
      cols.forEach(c => {
        const square = files[c] + (8 - r);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'square ' + (((r + c) % 2) ? 'dark' : 'light');

        if (state.selected === square) {
          button.classList.add('selected');
        }

        if (state.lastMove && (state.lastMove.from === square || state.lastMove.to === square)) {
          button.classList.add('last');
        }

        if (kingSquare === square) {
          if (state.chess.in_checkmate()) {
            button.classList.add('king-mate');
          } else if (state.chess.in_check()) {
            button.classList.add('king-check');
          }
        }

        if (state.selected) {
          const legal = state.chess.moves({ square: state.selected, verbose: true });
          if (legal.some(move => move.to === square)) {
            button.classList.add('legal');
          }
        }

        const piece = data[r][c];
        if (piece) {
          const span = document.createElement('span');
          span.className = 'piece';
          span.textContent = symbols[piece.color][piece.type];

          if (state.lastMove && state.lastMove.to === square) {
            const { dx, dy } = getSquareOffset(state.lastMove.from, state.lastMove.to);
            span.style.setProperty('--dx', `${dx}px`);
            span.style.setProperty('--dy', `${dy}px`);
            span.classList.add('move-anim');
          }

          button.appendChild(span);
        }

        button.onclick = () => onSquareClick(square);
        board.appendChild(button);
      });
    });

    renderMoves();
    updateStatus();
  }

  /* =========================
     MOVE HISTORY
  ========================= */

  function renderMoves() {
    const container = $('moves');
    if (!container || !state.chess) return;

    container.innerHTML = '';
    const history = state.chess.history({ verbose: true });

    for (let i = 0; i < history.length; i += 2) {
      const div = document.createElement('div');
      div.className = 'move';

      const num = Math.floor(i / 2) + 1;
      const wMove = history[i] ? history[i].san : '';
      const bMove = history[i + 1] ? history[i + 1].san : '';

      div.innerHTML =
        '<em>' + num + '.</em>' +
        '<span>' + wMove + '</span>' +
        '<span>' + bMove + '</span>';

      container.appendChild(div);
    }

    container.scrollTop = container.scrollHeight;
  }

  /* =========================
     GAMEPLAY LOGIC
  ========================= */

  function onSquareClick(square) {
    if (!state.connection) {
      showError('Please create or join a room to play online.');
      return;
    }

    if (state.chess.in_checkmate() || state.chess.in_draw()) {
      showError('Game over! Reset the match to play again.');
      return;
    }

    if (state.chess.turn() !== state.color) {
      showError("It's not your turn!");
      return;
    }

    const piece = state.chess.get(square);

    if (piece && piece.color === state.color) {
      state.selected = (state.selected === square) ? null : square;
      render();
      return;
    }

    if (state.selected) {
      const moves = state.chess.moves({ square: state.selected, verbose: true });
      const targetMove = moves.find(m => m.to === square);

      if (targetMove) {
        executeMove({ from: state.selected, to: square, promotion: 'q' });
        sendNetworkData({
          type: 'MOVE',
          move: { from: state.selected, to: square, promotion: 'q' }
        });
        state.selected = null;
        render();
      } else {
        state.selected = null;
        render();
      }
    }
  }

  function executeMove(moveObj) {
    try {
      const move = state.chess.move(moveObj);
      if (move) {
        state.lastMove = move;
        render();
      } else {
        showError('Invalid chess move.');
      }
    } catch (e) {
      showError('Move error: ' + e.message);
    }
  }

  /* =========================
     PEERJS / NETWORKING
  ========================= */

  function initPeer(customId = null) {
    if (state.peer) state.peer.destroy();

    try {
      state.peer = customId ? new Peer(customId) : new Peer();
    } catch (e) {
      showError('Failed to initialize PeerJS networking: ' + e.message);
      return;
    }

    state.peer.on('open', id => {
      if (state.host) {
        state.room = id.replace('royal-chess-', '');
        state.color = 'w';
        state.flipped = false;
        updateRoomUI();
        setRoomStatus('Room created! Share room ID.', true);
      }
    });

    state.peer.on('connection', conn => {
      if (state.host) {
        state.connection = conn;
        setupConnectionHandlers();

        sendNetworkData({
          type: 'INIT',
          name: state.name,
          fen: state.chess.fen()
        });

        if ($('opponentName'))$('opponentName').textContent = state.opponentName;
        setRoomStatus('Opponent connected!', true);
        render();
      } else {
        conn.close();
      }
    });

    state.peer.on('error', err => {
      console.error('PeerJS error:', err);
      if (err.type === 'unavailable-id') {
        setRoomStatus('Room ID in use. Generating a new one...');
        createRoom();
      } else if (err.type === 'peer-unavailable') {
        showError('Room not found! Double check the 6-digit Room ID.');
        setRoomStatus('Room not found. Check the ID.');
      } else if (err.type === 'network' || err.type === 'disconnected') {
        showError('Network connection lost. Please check your internet connection.');
        setRoomStatus('Network offline.');
      } else {
        showError('Network error: ' + err.type);
        setRoomStatus('Connection error: ' + err.type);
      }
    });
  }

  function setupConnectionHandlers() {
    state.connection.on('data', data => {
      switch (data.type) {
        case 'INIT':
          state.opponentName = data.name || 'Opponent';
          if ($('opponentName'))$('opponentName').textContent = state.opponentName;
          if (data.fen) state.chess.load(data.fen);
          sendNetworkData({ type: 'PROFILE', name: state.name });
          render();
          break;

        case 'PROFILE':
          state.opponentName = data.name || 'Opponent';
          if ($('opponentName'))$('opponentName').textContent = state.opponentName;
          break;

        case 'MOVE':
          executeMove(data.move);
          break;

        case 'NEW_GAME':
          state.chess.reset();
          state.selected = null;
          state.lastMove = null;
          render();
          break;
      }
    });

    state.connection.on('close', () => {
      showError('Opponent disconnected from the match.');
      setRoomStatus('Opponent disconnected.');
      state.connection = null;
      state.opponentName = 'Waiting...';
      if ($('opponentName'))$('opponentName').textContent = state.opponentName;
      render();
    });

    state.connection.on('error', err => {
      showError('Connection error: ' + err);
    });
  }

  function sendNetworkData(data) {
    if (state.connection && state.connection.open) {
      try {
        state.connection.send(data);
      } catch (e) {
        showError('Failed to send move: ' + e.message);
      }
    }
  }

  function createRoom() {
    const roomId = randomRoom();
    state.host = true;
    state.room = roomId;
    state.color = 'w';
    state.flipped = false;
    state.opponentName = 'Waiting...';

    if ($('opponentName'))$('opponentName').textContent = state.opponentName;
    setRoomStatus('Creating room...');
    initPeer('royal-chess-' + roomId);
  }

  function joinRoom() {
    const input = $('roomInput');
    const rawInput = input ? input.value.trim() : '';

    if (!rawInput || rawInput.length !== 6) {
      showError('Please enter a valid 6-digit Room ID.');
      setRoomStatus('Enter a valid 6-digit Room ID.');
      return;
    }

    state.host = false;
    state.room = rawInput;
    state.color = 'b';
    state.flipped = true;
    state.opponentName = 'Host';

    if ($('opponentName'))$('opponentName').textContent = state.opponentName;
    updateRoomUI();

    setRoomStatus('Connecting to room...');
    initPeer();

    state.peer.on('open', () => {
      const peerId = 'royal-chess-' + rawInput;
      state.connection = state.peer.connect(peerId);

      state.connection.on('open', () => {
        setupConnectionHandlers();
        sendNetworkData({ type: 'PROFILE', name: state.name });
        setRoomStatus('Connected to room!', true);
        render();
      });
    });
  }

  function leaveRoom() {
    if (state.connection) state.connection.close();
    if (state.peer) state.peer.destroy();

    state.connection = null;
    state.peer = null;
    state.host = false;
    state.room = null;
    state.color = null;
    state.flipped = false;
    state.opponentName = 'Waiting...';

    if ($('opponentName'))$('opponentName').textContent = state.opponentName;
    if ($('roomInput'))$('roomInput').value = '';

    updateRoomUI();
    setRoomStatus('Left room.');

    state.chess.reset();
    state.selected = null;
    state.lastMove = null;
    render();
  }

  /* =========================
     INIT
  ========================= */

  function initEvents() {
    bind('settingsBtn', () => {
      if ($('nameInput'))$('nameInput').value = state.name;
      show('settingsMenu');
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => hide(btn.dataset.close));
    });

    bind('saveSettings', () => {
      const input = $('nameInput');
      const newName = input ? input.value.trim() : 'Player';
      state.name = newName || 'Player';

      localStorage.setItem('chessName', state.name);
      localStorage.setItem('chessTheme', state.theme);

      profile();
      sendNetworkData({ type: 'PROFILE', name: state.name });
      hide('settingsMenu');
    });

    bind('createBtn', createRoom);
    bind('joinBtn', joinRoom);
    bind('leaveBtn', leaveRoom);
    bind('shareBtn', shareRoom);
    bind('headerShareBtn', shareRoom);
    bind('roomBtn', () => { if ($('roomInput'))$('roomInput').focus(); });

    bind('newGameBtn', () => {
      if (!state.connection) {
        showError('Join a room before resetting the game.');
        return;
      }
      state.chess.reset();
      state.selected = null;
      state.lastMove = null;
      sendNetworkData({ type: 'NEW_GAME' });
      render();
    });
  }

  function init() {
    // 1. Verify library load
    if (!checkDependencies()) return;

    // 2. Initialize Chess instance safely
    try {
      state.chess = new Chess();
    } catch (e) {
      showError('Failed to initialize Chess engine: ' + e.message);
     return;
 }

    // 3. Render UI components
    buildThemes();
    profile();
    initEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();