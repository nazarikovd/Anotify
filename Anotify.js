const axios = require('axios')
const EventEmitter = require('events')
const path = require('path')


const anotifydb = require(path.join(__dirname, 'database', 'db.js'))
const anotifyapi = require(path.join(__dirname, 'AnotifyApi.js'))


module.exports = class Anotify extends EventEmitter {


	constructor() {

		super()

		this.api = new anotifyapi()
		this.db = new anotifydb()
		this.checkInterval = null
	}

	async addArtist(artistUrl) {

		const domain = this._extractArtistDomain(artistUrl)
		if (!domain) throw new Error('Неправильный URL')

		const artistInfo = await this.api.getArtistWithAlbums(domain)
		if (!artistInfo) throw new Error('Не могу найти такого артиста')

		const artist = artistInfo.artist

		this.db.addArtist(artist.id, artist.name, artist.domain)
		this.db.updateArtistRelease(artist.id, artistInfo.last)

		return artist

	}

	subscribeUser(user_id, artist_id) {

		return this.db.subscribe(user_id, artist_id)
	}

	async unsubscribeUser(user_id, artistUrl=null) {

		if(!artistUrl){
			if(this.db.getUserSubscriptions(user_id).length > 0){
				return this.db.unsubscribeAll(user_id)
			}else{
				throw new Error('Вы не подписаны')
			}

		}

		const domain = this._extractArtistDomain(artistUrl)
		if (!domain) throw new Error('Неправильный URL')

		let artist_id = await this.api.getArtistIdByDomain(domain)
		if (!artist_id) throw new Error('Не могу найти такого артиста')

		const subs = this.db.getUserSubscriptions(user_id)

		if(subs.filter((artist) => String(artist.artist_id) == String(artist_id)).length < 1){
			throw new Error('Вы не подписаны')
		}

		return this.db.unsubscribe(user_id, artist_id)
	}

	startChecking(intervalMinutes = 1) {

		this.stopChecking()

		this.checkInterval = setInterval(async() => {

			try {

				this.db.clear()
				await this._checkNewReleases()

			} catch(error) {

				this.emit('error', error)

			}

		}, intervalMinutes * 60 * 1000)

		setImmediate(() => this._checkNewReleases())
	}

	stopChecking() {

		if(this.checkInterval) {
			clearInterval(this.checkInterval)
			this.checkInterval = null
		}
	}

	async _checkNewReleases() {
		const artistsToCheck = this.db.getArtistsToCheck(20);
		this.emit('log', `[Anotify] Проверяем ${artistsToCheck.length} артистов`);

		for (const artist of artistsToCheck) {

			try {

				this.emit('log', `Проверяем артиста: ${artist.name}`)
				
				const lastAlbum = await this.api.getLastAlbum(artist.domain)
				if (!lastAlbum) {
					this.emit('log', `Для артиста ${artist.name} альбомов нет. Пропускаем.`);
					continue;
				}

				const currentReleaseId = lastAlbum.id.toString()
				const currentUpdateTime = lastAlbum.updateTime

				const lastReleaseId = artist.last_release_id?.toString()
				const lastUpdateTime = artist.last_release_date

				if (!lastReleaseId || currentReleaseId !== lastReleaseId || currentUpdateTime > lastUpdateTime) {

					this.emit('log', `Найден новый релиз для ${artist.name}: ${lastAlbum.title}`)

					this.db.updateArtistRelease(artist.artist_id, {
						id: currentReleaseId,
						title: lastAlbum.title,
						updateTime: currentUpdateTime
					});

					const subscribers = this.db.getSubscribers(artist.artist_id)

					if (subscribers.length > 0) {

						this.emit('new_release', {
							artistId: artist.artist_id,
							artistName: artist.name,
							artistDomain: artist.domain,
							release: lastAlbum,
							subscribers: subscribers
						})

					}

				} else {

					this.emit('log', `Новых релизов для ${artist.name} нет.`)
				}

			} catch (error) {

				this.emit('error', { error, artist })

			} finally {

				this.db.updateArtistCheckTime(artist.artist_id);
				this.emit('log', `[Anotify] Обновлено время проверки для артиста: ${artist.name}`)
				
			}

			await new Promise(resolve => setTimeout(resolve, 500))
		}
	}

	_extractArtistDomain(url) {

		if (!url || typeof url !== 'string') return null

		try {

			let normalizedUrl = url.trim()

			if (!normalizedUrl.startsWith('http')){

				normalizedUrl = 'https://' + normalizedUrl

			}

			const urlObj = new URL(normalizedUrl)
			
			if (urlObj.hostname !== 'vk.com' && urlObj.hostname !== 'www.vk.com') {
				return null
			}

			const pathParts = urlObj.pathname.split('/').filter(part => part !== '')
			
			if (pathParts.length >= 2 && pathParts[0] === 'artist') {
				return pathParts[1]
			}

			return null

		} catch (error) {
			console.error('Не получилось достать домен:', error)
			return null
		}

	}
}