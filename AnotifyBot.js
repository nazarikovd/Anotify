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

    const ownerId = release.ownerId
    const releaseId = release.id
    const albumUrl = `https://vk.com/artist/${artistDomain}?z=audio_playlist${ownerId}_${releaseId}`

    const photo = release.photo
    const coverUrl = photo.photo_1200 || photo.photo_600 || photo.photo_300
    
    const genres = (release.genres && release.genres.length > 0) 
        ? release.genres.map(genre => genre.name).join(', ')
        : 'жанр не указан'
    
    const mainArtists = release.mainArtists
    const artists = mainArtists && mainArtists.length > 0
        ? mainArtists.map(artist => artist.name).join(', ')
        : artistName

    const trackCount = release.trackCount
    const subtitle = release.subtitle ? ` ${release.subtitle}` : ''

    const message = `🚨 НОВЫЙ РЕЛИЗ\n\n🎵 ${artists}: "${release.title}"${subtitle}\n💿 ${trackCount} ${getTrackWord(trackCount)}, ${genres}\n\n${albumUrl}`;

    let photoAttachment = ''

    try {

        const photoUpload = await vk.upload.messagePhoto({
            source: {
                value: coverUrl
            }
        })

        photoAttachment = `photo${photoUpload.ownerId}_${photoUpload.id}`

    } catch (e) {

        console.error('Ошибка загрузки обложки:', e)
    }

    for (const userId of subscribers) {

        try {

            await vk.api.messages.send({
                user_id: userId,
                message: message,
                attachment: photoAttachment,
                random_id: Math.floor(Math.random() * 1e10)
            })

        } catch (e) {

            console.error(`Ошибка отправки пользователю ${userId}:`, e)

        }
    }
})


function getTrackWord(count) {
    if (count % 10 === 1 && count % 100 !== 11) return 'трек';
    if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'трека';
    return 'треков';
}


hearManager.hear(/^\/sub\s+https?:\/\/vk\.com\/artist\/\S+|^https?:\/\/vk\.com\/artist\/\S+/i, async(context) => {

	try {

		let identifier = context.$match[0]
		if(identifier.includes("/sub")){
			identifier = identifier.split(" ")[1]
		}
		if(!identifier.includes("https://vk.com/artist/")) return context.send("Нужна ссылка в формате\nhttps://vk.com/artist/domain")
		const artist = await anotify.addArtist(identifier)
		const result = anotify.subscribeUser(context.senderId, artist.id)
		const artistName = artist.name

        const photoUpload = await vk.upload.messagePhoto({
            source: {
                value: artist.photo
            }
        })

        const photoAttachment = `photo${photoUpload.ownerId}_${photoUpload.id}`

		await context.send(`✅ Вы подписались на артиста: ${artistName}\n\nСписок подписок: /my_subs\nОтписаться: /unsub `+identifier, {
			attachment: photoAttachment
		})

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

hearManager.hear("/unsuball", async(context) => {

	try {

		await anotify.unsubscribeUser(context.senderId)

		await context.send(`✅ Вы отписались от всех артистов`)

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

hearManager.hear({}, async(context) => {
	console.log(context)
	context.send('Чтобы подписаться на уведомления о новых треках, отправьте ссылку в формате\nhttps://vk.com/artist/domain\n\nВаши подписки:\n/my_subs\n\nОтписаться:\n/unsub https://vk.com/artist/domain\n\nОтписаться от всех:\n/unsuball', {
		attachment: ["photo-232193000_457239033", "photo-232193000_457239034"]
	})
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
