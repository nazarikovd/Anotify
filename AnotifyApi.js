const axios = require('axios')
const path = require('path')

const Aconfig = require(path.join(__dirname, 'AnotifyConfig.js'))

module.exports = class AnotifyApi{

	constructor() {
		this.token = Aconfig.user_access_token
		this.apiVersion = '5.100'
	}

	async getArtistWithAlbums(artistIdentifier) {

		try {

			const response = await this._makeRequest('catalog.getAudioArtist', {
				need_blocks: 1,
				artist_id: artistIdentifier
			})

			if (!response?.artists?.[0]) {
				throw new Error('Artist not found')
			}

			return this._formatArtistWithAlbums(response)

		} catch (error) {
			
			console.error('Error in getArtistWithAlbums:', error)
			throw error
		}
	}

	async getLastAlbum(artistIdentifier) {

		try {

			const artistData = await this.getArtistWithAlbums(artistIdentifier)
			
			if (artistData.albums.length === 0) {
				throw new Error('No albums found for this artist')
			}

			return artistData.last

		} catch (error) {

			console.error('Error in getLastAlbum:', error)
			throw error
		}
	}

	async getArtistInfo(artistIdentifier) {

		try {

			const artistData = await this.getArtistWithAlbums(artistIdentifier)
			return artistData.artist

		} catch (error) {

			console.error('Error in getArtistInfo:', error)
			throw error
		}
	}

	async searchArtists(name) {

		try {

			const response = await this._makeRequest('audio.searchArtists', {
				q: name,
				count: 10
			})

			if (!response?.items?.[0]) {
				throw new Error('Artist not found')
			}

			return response.items

		} catch (error) {

			console.error('Error in searchArtist:', error)
			throw error
		}
	}

	async getArtistAlbums(artistIdentifier) {

		try {

			const artistData = await this.getArtistWithAlbums(artistIdentifier)
			return artistData.albums

		} catch (error) {

			console.error('Error in getArtistAlbums:', error)
			throw error
		}
	}

	async getArtistIdByDomain(domain) {

		try {

			const artistInfo = await this.getArtistInfo(domain)
			return artistInfo.id

		} catch (error) {

			console.error('Error in getArtistIdByDomain:', error)
			throw error
		}
	}

	async _makeRequest(method, params = {}) {

		try {

			const response = await axios.get(`https://api.vk.com/method/${method}`, {
				params: {
					...params,
					access_token: this.token,
					v: this.apiVersion
				}
			})

			if (response.data.error) {

				throw new Error(`VK API Error: ${response.data.error.error_msg}`)
			}

			return response.data.response

		} catch(error) {

			console.error('VK API Error:', error.response ? error.response.data : error.message)
			throw error
		}
	}

	_formatAlbum(album) {

		return {
			id: album.id,
			ownerId: album.owner_id,
			title: album.title,
			description: album.description,
			trackCount: album.count,
			followers: album.followers,
			plays: album.plays,
			createTime: album.create_time,
			updateTime: album.update_time,
			year: album.year,
			genres: album.genres || [],
			isFollowing: album.is_following || false,
			isExplicit: album.is_explicit || false,
			mainArtists: album.main_artists || [],
			albumType: album.album_type,
			mainColor: album.main_color,
			accessKey: album.access_key,
			photo: album.photo || {},
			subtitle: album.subtitle || ""
		}
	}

	_formatArtistWithAlbums(response) {

		const artistData = response.artists[0]
		const playlistsData = response.playlists || []
		

		const playlists = playlistsData
			.filter(item => item.album_type === 'playlist')
			.map(item => this._formatAlbum(item))
		

		const albums = playlistsData
			.filter(item => item.album_type !== 'playlist')
			.map(item => this._formatAlbum(item))

		const sortedAlbums = [...albums].sort((a, b) => b.updateTime - a.updateTime)
		const last = sortedAlbums[0] || null

		return {
			artist: {
				id: artistData.id,
				name: artistData.name,
				domain: artistData.domain,
				photo: artistData.photo.at(-1).url || null,
				isAlbumCover: artistData.is_album_cover || false
			},
			albums: albums,
			playlists: playlists,
			last: last,
			totalAlbums: albums.length,
			totalPlaylists: playlists.length
		}
	}
}