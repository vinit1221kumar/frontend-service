export type CallMode = "audio" | "video";

export type ConnectionStatus =
  | "idle"
  | "requesting-media"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "failed";

export interface SignalSessionDescription {
  type: RTCSdpType;
  sdp: string;
}

export interface OfferPayload extends SignalSessionDescription {
  fromUserId: string;
  mode: CallMode;
  createdAt: number;
}

export interface AnswerPayload extends SignalSessionDescription {
  fromUserId: string;
  createdAt: number;
}

export interface IceCandidatePayload {
  fromUserId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment?: string | null;
  createdAt: number;
}

export interface IncomingCall {
  calleeUserId: string;
  offer: OfferPayload;
}
