const { VK } = require('vk-io')
const { HearManager } = require('@vk-io/hear')
const path = require('path')

const Anotify = require(path.join(__dirname, 'Anotify.js'))
const Aconfig = require(path.join(__dirname, 'AnotifyConfig.js'))

const vk = new VK({
	token: Aconfig.bot_access_token,
	apiMode: 'sequential'
})

const hearManager = new HearManager()
const anotify = new Anotify()


anotify.startChecking(60)


anotify.on('new_release', async ({ artistId, artistName, artistDomain, release, subscribers }) => {

	const albumUrl = `https://vk.com/artist/${artistDomain}?z=audio_playlist${release.ownerId}_${release.id}`
	
	const message = `🎵 Новый релиз от ${artistName}: "${release.title}"\n\nСсылка: ${albumUrl}`

	for (const userId of subscribers) {

		try {

			await vk.api.messages.send({
				user_id: userId,
				message: message,
				random_id: Math.floor(Math.random() * 1e10)
			});

		} catch (e) {

			console.error(`Ошибка отправки пользователю ${userId}:`, e)
		}
	}
})


hearManager.hear(/^\/sub (.+)/i, async(context) => {

	try {

		const identifier = context.$match[1]
		const artist = await anotify.addArtist(identifier)
		const result = anotify.subscribeUser(context.senderId, artist.id)
		const artistName = artist.name

		await context.send(`✅ Вы подписались на артиста: ${artistName}`)

	} catch(e) {

		await context.send(`❌ Ошибка: ${e.message}`)
	}
})


hearManager.hear(/^\/unsub (.+)/i, async(context) => {

	try {

		const identifier = context.$match[1]

		await anotify.unsubscribeUser(context.senderId, identifier)

		await context.send(`✅ Вы отписались от артиста`)

	} catch(e) {

		await context.send(`❌ Ошибка: ${e.message}`)
	}
})


hearManager.hear(/^\/my_subs/i, async(context) => {

	const subs = anotify.db.getUserSubscriptions(context.senderId)

	if(subs.length === 0) return context.send('У вас нет подписок')

	const list = subs.map(artist => `• ${artist.name} (ID: ${artist.artist_id})`).join('\n')
	await context.send(`Ваши подписки:\n${list}`)

})


anotify.on('error', (error) => {

	console.error('Ошибка в anotify:', error)
})

anotify.on('log', (msg) => {

	console.log(msg)
})

vk.updates.on('message_new', hearManager.middleware)

vk.updates.start().catch(console.error)
console.log('Бот запущен!')
