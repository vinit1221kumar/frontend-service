import { IceCandidatePayload } from "@/types/call";

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

interface CreatePeerConnectionArgs {
  onIceCandidate?: (candidate: IceCandidatePayload) => void;
  onTrack?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  senderUserId: string;
}

export function createPeerConnection({
  onIceCandidate,
  onTrack,
  onConnectionStateChange,
  senderUserId,
}: CreatePeerConnectionArgs): RTCPeerConnection {
  const peerConnection = new RTCPeerConnection({
    iceServers: DEFAULT_ICE_SERVERS,
  });

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !onIceCandidate) return;
    const c = event.candidate;
    onIceCandidate({
      fromUserId: senderUserId,
      candidate: c.candidate,
      sdpMid: c.sdpMid,
      sdpMLineIndex: c.sdpMLineIndex,
      usernameFragment: c.usernameFragment,
      createdAt: Date.now(),
    });
  };

  peerConnection.ontrack = (event) => {
    onTrack?.(event);
  };

  peerConnection.onconnectionstatechange = () => {
    onConnectionStateChange?.(peerConnection.connectionState);
  };

  return peerConnection;
}

export async function createOffer(peerConnection: RTCPeerConnection) {
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  return offer;
}

export async function createAnswer(peerConnection: RTCPeerConnection) {
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  return answer;
}

export async function setRemoteDescription(
  peerConnection: RTCPeerConnection,
  description: RTCSessionDescriptionInit
) {
  if (!description.sdp || !description.type) return;
  await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
}

export async function addIceCandidate(
  peerConnection: RTCPeerConnection,
  candidate: Pick<
    IceCandidatePayload,
    "candidate" | "sdpMid" | "sdpMLineIndex" | "usernameFragment"
  >
) {
  await peerConnection.addIceCandidate(
    new RTCIceCandidate({
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment ?? undefined,
    })
  );
}

export function attachLocalTracks(
  peerConnection: RTCPeerConnection,
  stream: MediaStream
) {
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });
}

export function cleanupPeerConnection(peerConnection: RTCPeerConnection | null) {
  if (!peerConnection) return;
  peerConnection.onicecandidate = null;
  peerConnection.ontrack = null;
  peerConnection.onconnectionstatechange = null;
  peerConnection.close();
}
