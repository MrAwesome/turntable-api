import Connection from './connection'
import { sha1 } from './utils'

import type { CommandMessage, Response } from './types/messages'
import type {
  CommandResult,
  AddDJ,
  Deregistered,
  NewSong,
  NoSong,
  PMed,
  Registered,
  RemoveDJ,
  Snagged,
  SongSearchResults,
  SongResult,
  Speak,
  UpdateRoom,
  UpdateVotes,
  PlaylistAllResults
} from './types/commands'
import type { PMHistory, RoomInfo } from './types/actions'

export type EventHandler<MessageType = CommandMessage> = (m: MessageType) => void
export type CommandCallback = (data: CommandMessage | 'no_session' | CommandResult) => void

export interface TurntableOptions {
  host?: string
  userId: string
  userAuth: string
  roomId: string

  debug?: boolean
}

class Turntable {
  options: TurntableOptions
  conn: Connection
  eventHandlers: Record<string, EventHandler[]> = {}
  songSearchResults: Record<string, SongResult[][] | undefined> = {}

  roomId?: string
  currentDjId: string | null = null
  currentSongId: string | null = null

  constructor(options: TurntableOptions) {
    this.options = options
    this.conn = new Connection(options?.host, options.userId, options.userAuth, this.onMessage)
    this.conn.debug = !!options.debug

    setInterval(() => this.updatePresence(), 10000)
  }

  on(event: Registered['command'], handler: EventHandler<Registered>): void
  on(event: Deregistered['command'], handler: EventHandler<Deregistered>): void
  on(event: AddDJ['command'], handler: EventHandler<AddDJ>): void
  on(event: RemoveDJ['command'], handler: EventHandler<RemoveDJ>): void
  on(event: NewSong['command'], handler: EventHandler<NewSong>): void
  on(event: NoSong['command'], handler: EventHandler<NoSong>): void
  on(event: Snagged['command'], handler: EventHandler<Snagged>): void
  on(event: UpdateVotes['command'], handler: EventHandler<UpdateVotes>): void
  on(event: UpdateRoom['command'], handler: EventHandler<UpdateRoom>): void
  on(event: Speak['command'], handler: EventHandler<Speak>): void
  on(event: PMed['command'], handler: EventHandler<PMed>): void
  on(event: SongSearchResults['command'], handler: EventHandler<SongSearchResults>): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: EventHandler<any>) {
    this.eventHandlers[event] ? this.eventHandlers[event].push(handler) : (this.eventHandlers[event] = [handler])
  }

  onMessage: CommandCallback = async (message) => {
    if (message == 'no_session') {
      this.authenticate()
    } else {
      if (message.command == 'newsong') {
        this.currentDjId = (message as NewSong).room.metadata.current_dj
        this.currentSongId = (message as NewSong).room.metadata.current_song?._id ?? null
      } else if (message.command == 'nosong') {
        this.currentDjId = null
        this.currentSongId = null
      } else if (message.command == 'search_complete') {
        const {page, query, docs} = message as SongSearchResults;

        // NOTE: Pages start at 1
        if (this.songSearchResults[query] === undefined) {
          this.songSearchResults[query] = [];
        }
        if (this.songSearchResults[query]![page-1] === undefined) {
          this.songSearchResults[query]![page-1] = docs;
        }
      }

      this.eventHandlers[message.command]?.forEach(handler => handler.apply(this, [message]))
    }
  }

  async authenticate(): Promise<void> {
    return new Promise((resolve, reject) => {
        this.conn.socket.on('open', async () => {
        try {
          const authRes = await this.authenticateINNER();
          resolve(authRes);
            } catch (err) {
                reject(err);
            }
        });
    });
  }

  private async authenticateINNER(): Promise<void> {
    await this.updatePresence()
    await this.setBot()

    await this.join(this.options.roomId)
    this.roomId = this.options.roomId

    const infoRes = await this.roomInfo()

    if (infoRes.success) {
        const {room} = infoRes;
        this.currentDjId = room.metadata.current_dj
        this.currentSongId = room.metadata.current_song?._id ?? null
    } else {
        throw new Error(`Failed to get roominfo! Error:, ${infoRes.err}`);
    }
  }

  async updatePresence() {
    return this.conn.sendMessage({ api: 'presence.update', status: 'available' })
  }

  async setBot() {
    return this.conn.sendMessage({ api: 'user.set_bot' })
  }

  async join(roomid: string) {
    return this.conn.sendMessage({ api: 'room.register', roomid })
  }

  async leave() {
    return this.conn.sendMessage({ api: 'room.deregister' })
  }

  async roomInfo(): Promise<Response<RoomInfo>> {
    return this.conn.sendMessage({ api: 'room.info', roomid: this.roomId })
  }

  async speak(text: string) {
    return this.conn.sendMessage({ api: 'room.speak', roomid: this.roomId, text })
  }

  async pm(text: string, receiverid: string) {
    return this.conn.sendMessage({ api: 'pm.send', receiverid, text })
  }

  async pmHistory(receiverid: string): Promise<Response<PMHistory>> {
    return this.conn.sendMessage({ api: 'pm.history', receiverid })
  }

  async fan(djid: string) {
    return this.conn.sendMessage({ api: 'user.become_fan', djid })
  }

  async unfan(djid: string) {
    return this.conn.sendMessage({ api: 'user.remove_fan', djid })
  }

  async addModerator(target_userid: string) {
    return this.conn.sendMessage({ api: 'room.add_moderator', roomid: this.roomId, target_userid })
  }

  async removeModerator(target_userid: string) {
    return this.conn.sendMessage({ api: 'room.rem_moderator', roomid: this.roomId, target_userid })
  }

  async bootUser(target_userid: string, reason: string) {
    return this.conn.sendMessage({ api: 'room.boot_user', roomid: this.roomId, target_userid, reason })
  }

  async addDJ() {
    return this.conn.sendMessage({ api: 'room.add_dj', roomid: this.roomId })
  }

  async removeDJ(djid?: string) {
    return this.conn.sendMessage({ api: 'room.rem_dj', roomid: this.roomId, djid: djid || this.options.userId })
  }

  async skipSong() {
    return this.conn.sendMessage({
      api: 'room.stop_song',
      roomid: this.roomId,
      djid: this.currentDjId,
      current_song: this.currentSongId
    })
  }

  async snag() {
    if (!this.currentSongId) return Promise.resolve(null)

    const sh = sha1(Math.random().toString())
    const fh = sha1(Math.random().toString())
    const vh = sha1(
      [
        this.options.userId,
        this.currentDjId,
        this.currentSongId,
        this.roomId,
        'queue',
        'board',
        'false',
        'false',
        sh
      ].join('/')
    )

    await this.conn.sendMessage({
      api: 'snag.add',
      djid: this.currentDjId,
      songid: this.currentSongId,
      roomid: this.roomId,
      site: 'queue',
      location: 'board',
      in_queue: 'false',
      blocked: 'false',
      client: 'web',
      sh,
      fh,
      vh
    })

    return this.playlistAdd()
  }

  async vote(val: 'up' | 'down') {
    if (!this.currentSongId) return Promise.resolve(null)

    const vh = sha1(this.roomId + val + this.currentSongId)
    const th = sha1(Math.random().toString())
    const ph = sha1(Math.random().toString())

    return this.conn.sendMessage({ api: 'room.vote', roomid: this.roomId, val, vh, th, ph })
  }

  async voteUp() {
    return this.vote('up')
  }

  async voteDown() {
    return this.vote('down')
  }

  async playlistAdd(songId = this.currentSongId, playlist_name = 'default', index = -1) {
    return this.conn.sendMessage({ api: 'playlist.add', playlist_name, song_dict: { fileid: songId }, index })
  }

  async playlistRemove(index = 0, playlist_name = 'default'): Promise<Response<{song_dict: Array<{fileid: string}>}>> {
    return this.conn.sendMessage({ api: 'playlist.remove', playlist_name, index })
  }

  async playlistAll(playlist_name = 'default'): Promise<Response<PlaylistAllResults>> {
    return this.conn.sendMessage({ api: 'playlist.all', playlist_name })
  }

  async playlistListAll() {
    return this.conn.sendMessage({ api: 'playlist.list_all' })
  }

  async playlistDelete(playlistName = 'default') {
    return this.conn.sendMessage({api: 'playlist.delete', playlist_name: playlistName});
  }

  async playlistCreate(playlistName = 'default') {
     return this.conn.sendMessage({api: 'playlist.create', playlist_name: playlistName});
  }

  async playlistSwitch(playlistName = 'default'): Promise<Response<{playlist_name: string}>> {
     return this.conn.sendMessage({api: 'playlist.switch', playlist_name: playlistName});
  }

  async startSongSearch(query: string) {
    return this.conn.sendMessage({ api: 'file.search', query })
  }

  // NOTE: undefined here means that no results have yet been returned.
  getSongSearchResultsForQuery(query: string): SongResult[][] | undefined {
    return this.songSearchResults[query]?.filter((x) => x !== undefined) as SongResult[][]
  }

  async waitForSongSearchResultsForQuery(
    query: string,
    waitForMs: number = 5000,
    intervalWaitCheckMs: number = 100
  ): Promise<SongResult[][]> {
    return new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error("Timed out waiting for song results!")), waitForMs)

      const getRes = () => {
        const res = this.getSongSearchResultsForQuery(query);
        if (res !== undefined) {
          resolve(res);
        }
      }

      getRes()
      setInterval(getRes, intervalWaitCheckMs)
    });
  }

  // NOTE: named differently from the old ttapi, since it returns all known pages of song results
  // instead of the raw result object
  async searchForSongs(query: string): Promise<SongResult[][]> {
    this.startSongSearch(query);
    return this.waitForSongSearchResultsForQuery(query);
  }

  async quickAddSong(query: string, playlistName: string): Promise<SongResult> {
    const results = await this.searchForSongs(query);
    const song = results[0][0];
    await this.playlistAdd(song._id, playlistName, 0);
    return song;
  }
}

export default Turntable
