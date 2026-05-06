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

io.onConnection(channel => {
  console.log("Yangi o'yinchi ulandi! ID:", channel.id);

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

  channel.onDisconnect(() => {
    console.log("O'yinchi chiqib ketdi:", channel.id);
    delete players[channel.id];
    io.emit('playerLeft', channel.id);
  });
});

const port = 3001;
server.listen(port, '0.0.0.0', () => {
  console.log('Multiplayer server 3001-portda ishga tushdi...');
});
