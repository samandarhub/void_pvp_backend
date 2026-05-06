import http from 'http'
import geckos from '@geckos.io/server'

// Render uchun oddiy HTTP server yaratish (CORS bilan)
const server = http.createServer((req, res) => {
  console.log(`Kelgan so'rov: ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  res.writeHead(200)
  res.end('Server is running')
})

// Geckos.io serverini CORS sozlamalari bilan yaratish
// server.js ichida
const io = geckos({
  cors: {
    origin: 'https://void-pvp.pages.dev', // Aniq manzilni ko'rsatamiz
    allowAuthorization: true
  }
});
io.addServer(server)

// O'yinchilar ma'lumotlarini saqlash uchun obyekt
let players = {}

io.onConnection(channel => {
  console.log(`Yangi o'yinchi ulandi! ID: ${channel.id}`)

  // O'yinchi harakatlanganda
  channel.on('move', data => {
    players[channel.id] = {
      position: data.position,
      rotation: data.rotation,
      weaponIdx: data.weaponIdx ?? 0
    }
    io.emit('stateUpdate', players)
  })

  // O'yinchi o'q otganda — boshqalarga uzatish
  channel.on('shoot', data => {
    // O'zidan boshqa hammaga yuborish
    channel.broadcast.emit('remoteShoot', {
      playerId: channel.id,
      ...data
    })
  })

  // O'yinchi boshqasini urganda — nishonga damage yuborish
  channel.on('playerHit', data => {
    // Nishon o'yinchiga damage xabarini yuborish
    io.emit('damage', {
      targetId: data.targetId,
      damage: data.damage,
      attackerId: channel.id
    })
  })

  // O'yinchi aloqani uzganda
  channel.onDisconnect(() => {
    console.log(`O'yinchi chiqib ketdi: ${channel.id}`)
    delete players[channel.id]
    io.emit('playerLeft', channel.id)
  })
})

// Serverni ishga tushirish (Nginx orqali proxy qilish uchun 3000-port tavsiya etiladi)
// server.js oxiri
const port = 3001; // Portni aniq 3001 qiling
server.listen(port, '0.0.0.0', () => {
  console.log(`Multiplayer server ${port}-portda ishga tushdi...`);
});
