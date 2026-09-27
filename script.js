(() => {
  'use strict';

  /* =========================
     HELPERS
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

  /* =========================
     STATE
  ========================= */

  const state = {
    name: localStorage.getItem('chessName') || 'Player',
    theme: localStorage.getItem('chessTheme') || 'royal',
    chess: new Chess(),
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
    if (el) el.addEventListener('click', fn);
  }

  function show(id) { $(id).hidden = false; }
  function hide(id) { $(id).hidden = true; }

  function randomRoom() {
    let result = '';
    for (let i = 0; i < 14; i++) {
      result += Math.floor(Math.random() * 10);
    }
    return result;
  }

  function setRoomStatus(text, online = false) {
    $('roomStatus').innerHTML =
      '<span class="connection-dot ' + (online ? 'online' : '') + '"></span>' + text;
  }

  function setStatus(text, cls = '') {
    $('status').className = 'status ' + cls;
    $('status').innerHTML = '<span class="label">Game</span><span>' + text + '</span>';
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
    $('playerName').textContent = state.name;
    $('myName').textContent = state.name;
    $('myAvatar').textContent = (state.name[0] || 'P').toUpperCase();
    $('nameInput').value = state.name;
    applyTheme();
    updatePlayerLabels();
  }

  function updatePlayerLabels() {
    if (state.color === 'b') {
      $('myColorLabel').textContent = 'Black';
      $('opponentColorLabel').textContent = 'White';
    } else {
      $('myColorLabel').textContent = 'White';
      $('opponentColorLabel').textContent = 'Black';
    }
  }

  function buildThemes() {
    const grid = $('themeGrid');
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
     ROOM UI
  ========================= */

  function updateRoomUI() {
    const room = state.room || 'Not connected';
    $('roomDisplay').textContent = room;
    $('headerRoom').textContent = room;

    $('whiteTurn').textContent = state.color === 'w' ? 'YOU' : '';
    $('blackTurn').textContent = state.color === 'b' ? 'YOU' : '';

    updatePlayerLabels();
  }

  /* =========================
     CHESS STATUS
  ========================= */

  function getKingSquare(color) {
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

  /* =========================
     RENDER BOARD
  ========================= */

  function render() {
    const board = $('board');
    board.innerHTML = '';
    board.classList.remove('checkmate-shake');

    if (state.chess.in_checkmate()) {
      void board.offsetWidth;
      board.classList.add('checkmate-shake');
    }

    const rows = state.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = state.flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const data = state.chess.board();

    const checkColor = state.chess.in_check() ? state.chess.turn() : null;
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
    if (!state.connection || state.chess.in_checkmate() || state.chess.in_draw()) return;
    if (state.chess.turn() !== state.color) return;

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
    const move = state.chess.move(moveObj);
    if (move) {
      state.lastMove = move;
      render();
    }
  }

  /* =========================
     PEERJS / NETWORKING
  ========================= */

  function initPeer(customId = null) {
    if (state.peer) state.peer.destroy();

    state.peer = customId ? new Peer(customId) : new Peer();

    state.peer.on('open', id => {
      if (state.host) {
        state.room = id;
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

        $('opponentName').textContent = state.opponentName;
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
        setRoomStatus('Room not found. Check the 14-digit ID.');
      } else {
        setRoomStatus('Connection error: ' + err.type);
      }
    });
  }

  function setupConnectionHandlers() {
    state.connection.on('data', data => {
      switch (data.type) {
        case 'INIT':
          state.opponentName = data.name || 'Opponent';
          $('opponentName').textContent = state.opponentName;
          if (data.fen) state.chess.load(data.fen);
          sendNetworkData({ type: 'PROFILE', name: state.name });
          render();
          break;

        case 'PROFILE':
          state.opponentName = data.name || 'Opponent';
          $('opponentName').textContent = state.opponentName;
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
      setRoomStatus('Opponent disconnected.');
      state.connection = null;
      state.opponentName = 'Waiting...';
      $('opponentName').textContent = state.opponentName;
      render();
    });
  }

  function sendNetworkData(data) {
    if (state.connection && state.connection.open) {
      state.connection.send(data);
    }
  }

  function createRoom() {
    const roomId = randomRoom();
    state.host = true;
    state.room = roomId;
    state.color = 'w';
    state.opponentName = 'Waiting...';

    $('opponentName').textContent = state.opponentName;
    setRoomStatus('Creating room...');
    initPeer('royal-chess-' + roomId);
  }

  function joinRoom() {
    const rawInput = $('roomInput').value.trim();
    if (!rawInput) {
      setRoomStatus('Enter a 14-digit Room ID.');
      return;
    }

    state.host = false;
    state.room = rawInput;
    state.color = 'b';
    state.flipped = true;
    state.opponentName = 'Host';

    $('opponentName').textContent = state.opponentName;
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
    state.opponentName = 'Waiting...';

    $('opponentName').textContent = state.opponentName;
    $('roomInput').value = '';

    updateRoomUI();
    setRoomStatus('Left room.');

    state.chess.reset();
    state.selected = null;
    state.lastMove = null;
    render();
  }

  /* =========================
     EVENT LISTENERS & INIT
  ========================= */

  function initEvents() {
    bind('settingsBtn', () => {
      $('nameInput').value = state.name;
      show('settingsMenu');
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => hide(btn.dataset.close));
    });

    bind('saveSettings', () => {
      const newName = $('nameInput').value.trim() || 'Player';
      state.name = newName;

      localStorage.setItem('chessName', state.name);
      localStorage.setItem('chessTheme', state.theme);

      profile();
      sendNetworkData({ type: 'PROFILE', name: state.name });
      hide('settingsMenu');
    });

    bind('createBtn', createRoom);
    bind('joinBtn', joinRoom);
    bind('leaveBtn', leaveRoom);
    bind('roomBtn', () => $('roomInput').focus());

    bind('flipBtn', () => {
      state.flipped = !state.flipped;
      render();
    });

    bind('newGameBtn', () => {
      if (!state.connection) return;
      state.chess.reset();
      state.selected = null;
      state.lastMove = null;
      sendNetworkData({ type: 'NEW_GAME' });
      render();
    });
  }

  function init() {
    buildThemes();
    profile();
    initEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
