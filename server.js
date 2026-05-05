import geckos from '@geckos.io/server'

// Geckos.io serverini yaratish
const io = geckos()

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

// Render uchun dinamik port yoki 9208 (lokal uchun)
const port = process.env.PORT || 3000
io.listen(port)
console.log(`Multiplayer server ${port}-portda ishga tushdi...`)
