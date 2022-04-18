type Message = ResponseMessage | CommandMessage
export default Message

export interface ResponseMessage {
  msgid: number
}

export interface ErrorResponse extends ResponseMessage {
  err: string,
  success: false,
}

export interface SuccessResponse extends ResponseMessage {
  success: true,
}

export type Response<T> = (T & SuccessResponse) | ErrorResponse;

export interface CommandMessage {
  command: string
  success: boolean
}

export interface APIMessage extends Record<string, unknown> {
  api: string
}
