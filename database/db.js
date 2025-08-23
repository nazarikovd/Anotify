const Database = require('better-sqlite3')
const path = require('path')

module.exports = class notifydb {
	constructor() {
		this.db = new Database(path.join(__dirname, 'anotify.db'))
		this._init()

	}

	_init() {
		this.db.pragma('journal_mode = WAL')

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS artists (
				artist_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				domain TEXT NOT NULL,
				last_check DATETIME,
				last_release_id TEXT,
				last_release_title TEXT,
				last_release_date INTEGER
			)
		`)

		this.db.exec(`
			CREATE TABLE IF NOT EXISTS subscriptions (
				user_id INTEGER,
				artist_id TEXT,
				PRIMARY KEY (user_id, artist_id)
			)
		`)


		this.db.exec('CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions (user_id)');
		this.db.exec('CREATE INDEX IF NOT EXISTS idx_sub_artist ON subscriptions (artist_id)');
		this.setupShutdown()
	}

	addArtist(artist_id, name, domain) {
		this.db.prepare(`
			INSERT OR REPLACE INTO artists 
			(artist_id, name, domain) 
			VALUES (?, ?, ?)
		`).run(String(artist_id), name, domain)
		
		return String(artist_id)
	}

	updateArtistRelease(artist_id, releaseData) {
		const stmt = this.db.prepare(`
			UPDATE artists SET 
				last_check = datetime('now'),
				last_release_id = ?,
				last_release_title = ?,
				last_release_date = ?
			WHERE artist_id = ?
		`)

		console.log('Updating artist:', artist_id, 'with data:', releaseData)

		stmt.run(
			String(releaseData.id),
			releaseData.title,
			releaseData.updateTime,
			String(artist_id)
		)
	}

	subscribe(user_id, artist_id) {
		this.db.prepare(`
			INSERT OR IGNORE INTO subscriptions (user_id, artist_id)
				VALUES (?, ?)
		`).run(Number(user_id), String(artist_id))
	}

	unsubscribe(user_id, artist_id) {
		this.db.prepare(`
			DELETE FROM subscriptions
			WHERE user_id = ? AND artist_id = ?
		`).run(Number(user_id), String(artist_id))
	}

	unsubscribeAll(user_id) {
		this.db.prepare(`
			DELETE FROM subscriptions
			WHERE user_id = ?
		`).run(Number(user_id))
	}

	getUserSubscriptions(user_id) {
		return this.db.prepare(`
			SELECT a.* FROM artists a
			JOIN subscriptions s ON a.artist_id = s.artist_id
			WHERE s.user_id = ?
		`).all(Number(user_id))
	}

	getSubscribers(artist_id) {
		return this.db.prepare(`
			SELECT user_id FROM subscriptions
			WHERE artist_id = ?
		`).all(String(artist_id)).map(row => row.user_id)
	}

	getArtistsToCheck(limit = 50) {
		return this.db.prepare(`
			SELECT * FROM artists
			ORDER BY last_check ASC NULLS FIRST
			LIMIT ?
		`).all(limit)
	}

	getArtist(artist_id) {
		return this.db.prepare(`
			SELECT * FROM artists 
			WHERE artist_id = ?
		`).get(String(artist_id))
	}

	updateArtistCheckTime(artist_id) {
		this.db.prepare(`
			UPDATE artists SET 
				last_check = datetime('now')
			WHERE artist_id = ?
		`).run(String(artist_id))
	}

	clear() {
		this.db.exec(`
			DELETE FROM artists 
			WHERE artist_id NOT IN (
				SELECT DISTINCT artist_id 
				FROM subscriptions
			)
		`)
	}
	setupShutdown() {

		process.on('exit', () => {
			this.db.close()
			console.log('Database connection closed on exit')
		});

		process.on('SIGINT', () => {
			this.db.close()
			console.log('Database connection closed on SIGINT')
			process.exit(0)
		});

		process.on('uncaughtException', (err) => {
			console.error('Uncaught exception:', err)
			this.db.close()
			process.exit(1)
		});
	}
}


