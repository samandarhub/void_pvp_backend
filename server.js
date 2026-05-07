import http from 'http'
import geckos from '@geckos.io/server'

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/favicon.ico') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200);
    res.end('Server is running');
    return;
  }
});

const io = geckos({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  cors: {
    origin: '*',
    allowAuthorization: true
  },
  portRange: {
    min: 9208,
    max: 9208
  }
});

io.addServer(server);

let players = {};
let matchmakingQueues = {
  '1v1': [],
  '2v2': [],
  '4v4': []
};
let matches = {}; // playerId -> matchId
let matchData = {}; // matchId -> { mode: string, players: [id1, id2...], scores: { id: 0... } }
let channels = {}; // id -> channel

io.onConnection(channel => {
  console.log("Yangi o'yinchi ulandi! ID:", channel.id);
  channels[channel.id] = channel;

  channel.on('findMatch', (data) => {
    const mode = data?.mode || '1v1';
    console.log(`Match qidirilmoqda: ${channel.id} (Mode: ${mode})`);
    
    // Tozalash
    Object.keys(matchmakingQueues).forEach(m => {
      matchmakingQueues[m] = matchmakingQueues[m].filter(id => id !== channel.id);
    });

    if (matches[channel.id]) {
      const oldMatchId = matches[channel.id];
      delete matchData[oldMatchId];
      delete matches[channel.id];
    }

    matchmakingQueues[mode].push(channel.id);

    // Kerakli o'yinchilar sonini aniqlash
    const requiredPlayers = parseInt(mode.split('v')[0]) * 2;

    if (matchmakingQueues[mode].length >= requiredPlayers) {
      const matchPlayers = [];
      for (let i = 0; i < requiredPlayers; i++) {
        matchPlayers.push(matchmakingQueues[mode].shift());
      }

      const matchId = `match_${Date.now()}`;
      const scores = {};
      matchPlayers.forEach(id => scores[id] = 0);

      matchData[matchId] = {
        mode,
        players: matchPlayers,
        scores
      };

      matchPlayers.forEach(id => {
        matches[id] = matchId;
        const opponentIds = matchPlayers.filter(pid => pid !== id);
        
        if (channels[id]) {
          channels[id].emit('matchFound', { 
            mode,
            opponentIds,
            team: matchPlayers.indexOf(id) < requiredPlayers / 2 ? 'A' : 'B'
          });
        }
      });
      
      console.log(`Match topildi! Mode: ${mode}, Players: ${matchPlayers.join(', ')}`);
    } else {
      // Agar match topilmasa, navbatdagi barchaga yangilanish yuborish
      matchmakingQueues[mode].forEach(id => {
        if (channels[id]) {
          channels[id].emit('queueUpdate', {
            current: matchmakingQueues[mode].length,
            required: requiredPlayers
          });
        }
      });
    }
  });

  channel.on('cancelMatch', () => {
    console.log("Match qidirish bekor qilindi:", channel.id);
    Object.keys(matchmakingQueues).forEach(mode => {
      if (matchmakingQueues[mode].includes(channel.id)) {
        matchmakingQueues[mode] = matchmakingQueues[mode].filter(id => id !== channel.id);
        const requiredPlayers = parseInt(mode.split('v')[0]) * 2;
        // Qolganlarga yangilanish yuborish
        matchmakingQueues[mode].forEach(id => {
          if (channels[id]) {
            channels[id].emit('queueUpdate', {
              current: matchmakingQueues[mode].length,
              required: requiredPlayers
            });
          }
        });
      }
    });
  });

  channel.on('move', data => {
    players[channel.id] = {
      position: data.position,
      rotation: data.rotation,
      weaponIdx: data.weaponIdx ?? 0
    };

    // O'zimizdan tashqari barcha o'yinchilarga holatni yuborish
    channel.broadcast.emit('stateUpdate', players);
  });

  channel.on('shoot', data => {
    channel.broadcast.emit('remoteShoot', {
      playerId: channel.id,
      ...data
    });
  });

  channel.on('playerHit', data => {
    const matchId = matches[data.targetId];
    if (!matchId || !matchData[matchId]) {
      // Agar matchda bo'lmasa ham damage ketaversin (test uchun)
      io.emit('damage', {
        targetId: data.targetId,
        damage: data.damage,
        attackerId: channel.id
      });
      return;
    }

    // Damage yuborish
    io.emit('damage', {
      targetId: data.targetId,
      damage: data.damage,
      attackerId: channel.id
    });
  });

  channel.on('playerKilled', data => {
    const victimId = channel.id;
    const attackerId = data.attackerId;
    const matchId = matches[victimId];

    if (matchId && matchData[matchId] && matchData[matchId].scores[attackerId] !== undefined) {
      matchData[matchId].scores[attackerId] += 1;
      const scores = matchData[matchId].scores;

      io.emit('scoreUpdate', { scores });

      if (scores[attackerId] >= 10) {
        io.emit('gameOver', { winnerId: attackerId });
        // Matchni tugatish
        const playersInMatch = matchData[matchId].players;
        playersInMatch.forEach(pid => delete matches[pid]);
        delete matchData[matchId];
      }
    }
  });

  channel.onDisconnect(() => {
    console.log("O'yinchi chiqib ketdi:", channel.id);
    delete players[channel.id];
    delete channels[channel.id];

    // Matchmaking navbatidan o'chirish
    Object.keys(matchmakingQueues).forEach(m => {
      matchmakingQueues[m] = matchmakingQueues[m].filter(id => id !== channel.id);
    });

    // Agar matchda bo'lsa, matchni tugatish
    const matchId = matches[channel.id];
    if (matchId && matchData[matchId]) {
      const opponentId = matchData[matchId].players.find(id => id !== channel.id);
      if (opponentId && channels[opponentId]) {
        channels[opponentId].emit('opponentLeft');
      }
      delete matchData[matchId];
    }
    delete matches[channel.id];

    io.emit('playerLeft', channel.id);
  });
});

const port = 3001;
server.listen(port, '0.0.0.0', () => {
  console.log('Multiplayer server 3001-portda ishga tushdi...');
});

