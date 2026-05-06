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
let matchmakingQueue = [];
let matches = {}; // playerId -> matchId
let matchData = {}; // matchId -> { players: [id1, id2], scores: { id1: 0, id2: 0 } }
let channels = {}; // id -> channel

io.onConnection(channel => {
  console.log("Yangi o'yinchi ulandi! ID:", channel.id);
  channels[channel.id] = channel;

  channel.on('findMatch', () => {
    console.log("Match qidirilmoqda:", channel.id);
    if (matchmakingQueue.includes(channel.id)) return;
    
    if (matches[channel.id]) {
      const oldMatchId = matches[channel.id];
      delete matchData[oldMatchId];
      delete matches[channel.id];
    }

    matchmakingQueue.push(channel.id);

    if (matchmakingQueue.length >= 2) {
      const p1Id = matchmakingQueue.shift();
      const p2Id = matchmakingQueue.shift();
      const matchId = `match_${Date.now()}`;

      matchData[matchId] = {
        players: [p1Id, p2Id],
        scores: { [p1Id]: 0, [p2Id]: 0 }
      };

      matches[p1Id] = matchId;
      matches[p2Id] = matchId;

      if (channels[p1Id]) channels[p1Id].emit('matchFound', { opponentId: p2Id });
      if (channels[p2Id]) channels[p2Id].emit('matchFound', { opponentId: p1Id });
      
      console.log("Match topildi!", p1Id, "vs", p2Id);
    }
  });

  channel.on('move', data => {
    players[channel.id] = {
      position: data.position,
      rotation: data.rotation,
      weaponIdx: data.weaponIdx ?? 0
    };
    io.emit('stateUpdate', players);
  });

  channel.on('shoot', data => {
    channel.broadcast.emit('remoteShoot', {
      playerId: channel.id,
      ...data
    });
  });

  channel.on('playerHit', data => {
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
    
    matchmakingQueue = matchmakingQueue.filter(id => id !== channel.id);
    
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
