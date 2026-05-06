import http from 'http'
import geckos from '@geckos.io/server'

// HTTP server yaratish
const server = http.createServer((req, res) => {
  // Faqat asosiy yo'l uchun javob beramiz
  if (req.url === '/' || req.url === '/favicon.ico') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200);
    res.end('Server is running');
    return;
  }
  // Qolgan so'rovlar (Geckos.io) uchun res.end() chaqirilmasligi kerak!
});

// Geckos.io serverini sozlash
const io = geckos({
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  cors: {
    origin: '*', // Hamma joydan ulanishga ruxsat
    allowAuthorization: true
  }
});

io.addServer(server);

let players = {};

io.onConnection(channel => {
  console.log(`Yangi o'yinchi ulandi! ID: ${channel.id}`);

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
    console.log(`O'yinchi chiqib ketdi: ${channel.id}`);
    delete players[channel.id];
    io.emit('playerLeft', channel.id);
  });
});

const port = 3001;
server.listen(port, '0.0.0.0', () => {
  console.log(`Multiplayer server ${port}-portda ishga tushdi...`);
});
