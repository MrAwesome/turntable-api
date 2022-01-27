import Connection, { MessageCallback } from './connection'
import { sha1 } from './utils'

import type { CommandMessage } from './types/messages'
import type {
  AddDJ,
  Deregistered,
  NewSong,
  NoSong,
  PMed,
  Registered,
  RemoveDJ,
  Speak,
  UpdateRoom,
  UpdateVotes
} from './types/commands'
import { RoomInfo } from './types/actions'

export type EventHandler<MessageType = CommandMessage> = (m: MessageType) => void

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
  on(event: UpdateVotes['command'], handler: EventHandler<UpdateVotes>): void
  on(event: UpdateRoom['command'], handler: EventHandler<UpdateRoom>): void
  on(event: Speak['command'], handler: EventHandler<Speak>): void
  on(event: PMed['command'], handler: EventHandler<PMed>): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: EventHandler<any>) {
    this.eventHandlers[event] ? this.eventHandlers[event].push(handler) : (this.eventHandlers[event] = [handler])
  }

  onMessage: MessageCallback = message => {
    if (message == 'no_session') {
      this.authenticate()
    } else {
      if (message.command == 'newsong') {
        this.currentDjId = (message as NewSong).room.metadata.current_dj
        this.currentSongId = (message as NewSong).room.metadata.current_song?._id ?? null
      } else if (message.command == 'nosong') {
        this.currentDjId = null
        this.currentSongId = null
      }

      this.eventHandlers[message.command]?.forEach(handler => handler.apply(this, [message]))
    }
  }

  async authenticate() {
    await this.updatePresence()
    await this.setBot()

    await this.join(this.options.roomId)
    this.roomId = this.options.roomId

    const { room } = await this.roomInfo()
    this.currentDjId = room.metadata.current_dj
    this.currentSongId = room.metadata.current_song?._id ?? null
  }

  updatePresence() {
    return this.conn.sendMessage({ api: 'presence.update', status: 'available' })
  }

  setBot() {
    return this.conn.sendMessage({ api: 'user.set_bot' })
  }

  join(roomid: string) {
    return this.conn.sendMessage({ api: 'room.register', roomid })
  }

  leave() {
    return this.conn.sendMessage({ api: 'room.deregister' })
  }

  roomInfo(): Promise<RoomInfo> {
    return this.conn.sendMessage({ api: 'room.info', roomid: this.roomId })
  }

  speak(text: string) {
    return this.conn.sendMessage({ api: 'room.speak', roomid: this.roomId, text })
  }

  addModerator(target_userid: string) {
    return this.conn.sendMessage({ api: 'room.add_moderator', roomid: this.roomId, target_userid })
  }

  removeModerator(target_userid: string) {
    return this.conn.sendMessage({ api: 'room.rem_moderator', roomid: this.roomId, target_userid })
  }

  bootUser(target_userid: string, reason: string) {
    return this.conn.sendMessage({ api: 'room.boot_user', roomid: this.roomId, target_userid, reason })
  }

  addDJ() {
    return this.conn.sendMessage({ api: 'room.add_dj', roomid: this.roomId })
  }

  removeDJ(djid?: string) {
    return this.conn.sendMessage({ api: 'room.rem_dj', roomid: this.roomId, djid: djid || this.options.userId })
  }

  skipSong() {
    return this.conn.sendMessage({
      api: 'room.stop_song',
      roomid: this.roomId,
      djid: this.currentDjId,
      current_song: this.currentSongId
    })
  }

  vote(val: 'up' | 'down') {
    const vh = sha1(this.roomId + val + this.currentSongId)
    const th = sha1(Math.random().toString())
    const ph = sha1(Math.random().toString())

    return this.conn.sendMessage({ api: 'room.vote', roomid: this.roomId, val, vh, th, ph })
  }

  voteUp() {
    return this.vote('up')
  }

  voteDown() {
    return this.vote('down')
  }
}

export default Turntable
