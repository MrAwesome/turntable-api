import { CommandMessage } from './messages'
import { User, DJList, Room } from './objects'

export type CommandResult = Registered | Deregistered | AddDJ | RemoveDJ | NewSong | NoSong | Snagged | UpdateVotes | UpdateRoom | Speak | PMed | SongSearchResults;

export interface Registered extends CommandMessage {
  command: 'registered'
  roomid: string
  user: User[]
}

export interface Deregistered extends CommandMessage {
  command: 'deregistered'
  roomid: string
  user: User[]
}

export interface AddDJ extends CommandMessage {
  command: 'add_dj'
  roomid: string
  user: User[]
  djs: DJList
}

export interface RemoveDJ extends CommandMessage {
  command: 'rem_dj'
  roomid: string
  user: User[]
  djs: DJList
}

export interface NewSong extends CommandMessage {
  command: 'newsong'
  roomid: string
  now: number
  room: Room
}

export interface NoSong extends CommandMessage {
  command: 'nosong'
  roomid: string
  room: Room
}

export interface Snagged extends CommandMessage {
  command: 'snagged'
  roomid: string
  userid: string
}

export interface UpdateVotes extends CommandMessage {
  command: 'update_votes'
  roomid: string
  current_song: { starttime: number; _id: string }
  room: {
    metadata: {
      downvotes: number
      listeners: number
      upvotes: number
      votelog: [string, 'up' | 'down'][]
    }
  }
}

export interface UpdateRoom extends CommandMessage {
  command: 'update_room'
  roomid: string
  description: string
}

export interface Speak extends CommandMessage {
  command: 'speak'
  roomid: string
  userid: string
  name: string
  text: string
}

export interface PMed extends CommandMessage {
  command: 'pmmed'
  userid: string
  senderid: string
  text: string
  time: number
  roomobj: Room
}

export interface YouTubeResult {
    sourceid: string
    source: string
    _id: string
    metadata: {
        adult: boolean
        artist: string
        coverart: string
        length: number
        region: never[]
        song: string
        ytid: string
    }
}

export interface SoundCloudResult {
    sourceid: string
    source: string
    _id: string
    metadata: {
        artist: string
        coverart: string
        length: number
        original_title: string
        scid: string
        sharing: string
        song: string
    }
}

export type SongResult = YouTubeResult | SoundCloudResult;

export interface SongSearchResults extends CommandMessage {
  command: 'search_complete'
  docs: Array<SongResult>
  internal_call: boolean
  page: number
  query: string
  success: boolean
  userids: string[]
}
