/**
 * PulseChat Application Protocol (PCAP) Codec for Node.js
 * Frame layout: [TYPE: 1 byte uint8] [LENGTH: 4 bytes uint32 Big-Endian] [PAYLOAD: N bytes UTF-8]
 */

export enum MessageType {
  CHAT_MESSAGE        = 0x01,
  JOIN_ROOM           = 0x02,
  LEAVE_ROOM          = 0x03,
  PRIVATE_MESSAGE     = 0x04,
  HEARTBEAT           = 0x05,
  HEARTBEAT_ACK       = 0x06,
  USER_REGISTER       = 0x07,
  SERVER_NOTIFICATION = 0x08,
  LIST_ROOMS          = 0x09,
  LIST_USERS          = 0x0A,
  ERROR_RESPONSE      = 0x0B,
  DISCONNECT          = 0x0C,
  GET_METRICS         = 0x0D,
  METRICS_UPDATE      = 0x0E
}

export const MessageTypeNames: Record<MessageType, string> = {
  [MessageType.CHAT_MESSAGE]: 'CHAT_MESSAGE',
  [MessageType.JOIN_ROOM]: 'JOIN_ROOM',
  [MessageType.LEAVE_ROOM]: 'LEAVE_ROOM',
  [MessageType.PRIVATE_MESSAGE]: 'PRIVATE_MESSAGE',
  [MessageType.HEARTBEAT]: 'HEARTBEAT',
  [MessageType.HEARTBEAT_ACK]: 'HEARTBEAT_ACK',
  [MessageType.USER_REGISTER]: 'USER_REGISTER',
  [MessageType.SERVER_NOTIFICATION]: 'SERVER_NOTIFICATION',
  [MessageType.LIST_ROOMS]: 'LIST_ROOMS',
  [MessageType.LIST_USERS]: 'LIST_USERS',
  [MessageType.ERROR_RESPONSE]: 'ERROR_RESPONSE',
  [MessageType.DISCONNECT]: 'DISCONNECT',
  [MessageType.GET_METRICS]: 'GET_METRICS',
  [MessageType.METRICS_UPDATE]: 'METRICS_UPDATE'
};

export const HEADER_SIZE = 5;

export interface DecodedFrame {
  type: MessageType;
  typeName: string;
  length: number;
  payload: string;
  rawHex: string;
  timestamp: string;
}

/**
 * Encodes a message type and string payload into a 5-byte header + payload PCAP Buffer
 */
export function encodeFrame(type: MessageType, payload: string = ''): Buffer {
  const payloadBuf = Buffer.from(payload, 'utf8');
  const frame = Buffer.allocUnsafe(HEADER_SIZE + payloadBuf.length);

  frame.writeUInt8(type, 0);
  frame.writeUInt32BE(payloadBuf.length, 1);
  if (payloadBuf.length > 0) {
    payloadBuf.copy(frame, HEADER_SIZE);
  }

  return frame;
}

/**
 * Streaming parser that handles TCP fragmentation, partial reads, and concatenated frames
 */
export class PCAPParser {
  private buffer: Buffer = Buffer.alloc(0);

  public push(chunk: Buffer): DecodedFrame[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: DecodedFrame[] = [];

    while (this.buffer.length >= HEADER_SIZE) {
      const typeVal = this.buffer.readUInt8(0);
      const payloadLen = this.buffer.readUInt32BE(1);

      // Validate opcode
      if (typeVal < 0x01 || typeVal > 0x0E) {
        // Discard 1 byte to attempt resync if corrupted
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const totalFrameLen = HEADER_SIZE + payloadLen;
      if (this.buffer.length < totalFrameLen) {
        // Waiting for remainder of frame
        break;
      }

      const rawFrame = this.buffer.subarray(0, totalFrameLen);
      const payloadBuf = this.buffer.subarray(HEADER_SIZE, totalFrameLen);
      const payloadStr = payloadBuf.toString('utf8');

      const now = new Date();
      const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;

      frames.push({
        type: typeVal as MessageType,
        typeName: MessageTypeNames[typeVal as MessageType] || `UNKNOWN_0x${typeVal.toString(16)}`,
        length: payloadLen,
        payload: payloadStr,
        rawHex: rawFrame.subarray(0, Math.min(32, rawFrame.length)).toString('hex').toUpperCase(),
        timestamp: timeStr
      });

      this.buffer = this.buffer.subarray(totalFrameLen);
    }

    return frames;
  }

  public clear(): void {
    this.buffer = Buffer.alloc(0);
  }
}
