import {
  DataSnapshot,
  Unsubscribe,
  child,
  get,
  off,
  onChildAdded,
  onValue,
  push,
  ref,
  remove,
  set,
} from "firebase/database";
import { getRealtimeDb } from "@/lib/firebase";
import { AnswerPayload, IceCandidatePayload, OfferPayload } from "@/types/call";

function userCallRef(userId: string) {
  return ref(getRealtimeDb(), `calls/${userId}`);
}

function log(message: string, payload?: unknown) {
  console.log(`[call] ${message}`, payload ?? "");
}

export async function startCall(params: {
  callerId: string;
  calleeId: string;
  offer: RTCSessionDescriptionInit;
  mode: "audio" | "video";
}) {
  const { callerId, calleeId, offer, mode } = params;
  const offerPayload: OfferPayload = {
    type: offer.type as RTCSdpType,
    sdp: offer.sdp ?? "",
    fromUserId: callerId,
    mode,
    createdAt: Date.now(),
  };
  log("startCall -> write offer", { callerId, calleeId, mode });
  await remove(child(userCallRef(callerId), "answer"));
  await remove(child(userCallRef(callerId), "rejected"));
  await remove(child(userCallRef(calleeId), `candidates/${callerId}`));
  await set(child(userCallRef(calleeId), "offer"), offerPayload);
  await remove(child(userCallRef(calleeId), "answer"));
}

export function listenForIncomingCall(
  userId: string,
  onIncoming: (payload: OfferPayload | null) => void
): Unsubscribe {
  const offerRef = child(userCallRef(userId), "offer");
  const unsubscribe = onValue(offerRef, (snapshot) => {
    onIncoming(snapshot.exists() ? (snapshot.val() as OfferPayload) : null);
  });
  return () => {
    off(offerRef);
    unsubscribe();
  };
}

export async function acceptCall(params: {
  userId: string;
  callerId: string;
  answer: RTCSessionDescriptionInit;
}) {
  const { userId, callerId, answer } = params;
  const payload: AnswerPayload = {
    type: answer.type as RTCSdpType,
    sdp: answer.sdp ?? "",
    fromUserId: userId,
    createdAt: Date.now(),
  };
  log("acceptCall -> write answer", { userId, callerId });
  await set(child(userCallRef(callerId), "answer"), payload);
  await remove(child(userCallRef(userId), "offer"));
  await remove(child(userCallRef(userId), "rejected"));
}

export function listenForAnswer(
  userId: string,
  onAnswer: (payload: AnswerPayload | null) => void
): Unsubscribe {
  const answerRef = child(userCallRef(userId), "answer");
  const unsubscribe = onValue(answerRef, (snapshot: DataSnapshot) => {
    onAnswer(snapshot.exists() ? (snapshot.val() as AnswerPayload) : null);
  });
  return () => {
    off(answerRef);
    unsubscribe();
  };
}

export async function publishIceCandidate(params: {
  targetUserId: string;
  fromUserId: string;
  candidate: IceCandidatePayload;
}) {
  const { targetUserId, fromUserId, candidate } = params;
  const candidatesRef = child(userCallRef(targetUserId), `candidates/${fromUserId}`);
  await set(push(candidatesRef), candidate);
}

export async function clearIceCandidates(userId: string, fromUserId: string) {
  await remove(child(userCallRef(userId), `candidates/${fromUserId}`));
}

export function listenForIceCandidates(params: {
  userId: string;
  fromUserId: string;
  onCandidate: (payload: IceCandidatePayload) => void;
}): Unsubscribe {
  const { userId, fromUserId, onCandidate } = params;
  const candidatesRef = child(userCallRef(userId), `candidates/${fromUserId}`);
  const unsubscribe = onChildAdded(candidatesRef, (snapshot) => {
    if (!snapshot.exists()) return;
    onCandidate(snapshot.val() as IceCandidatePayload);
  });
  return () => {
    off(candidatesRef);
    unsubscribe();
  };
}

export async function rejectCall(params: { userId: string; callerId: string }) {
  const { userId, callerId } = params;
  log("rejectCall", { userId, callerId });
  await remove(child(userCallRef(userId), "offer"));
  await remove(child(userCallRef(userId), `candidates/${callerId}`));
  await set(child(userCallRef(callerId), "rejected"), {
    byUserId: userId,
    createdAt: Date.now(),
  });
}

export function listenForRejection(
  userId: string,
  onRejected: (payload: { byUserId: string; createdAt: number } | null) => void
): Unsubscribe {
  const rejectedRef = child(userCallRef(userId), "rejected");
  const unsubscribe = onValue(rejectedRef, (snapshot) => {
    onRejected(
      snapshot.exists()
        ? (snapshot.val() as { byUserId: string; createdAt: number })
        : null
    );
  });
  return () => {
    off(rejectedRef);
    unsubscribe();
  };
}

export async function endCall(params: { userId: string; peerUserId?: string | null }) {
  const { userId, peerUserId } = params;
  log("endCall", { userId, peerUserId });
  const tasks: Promise<void>[] = [remove(userCallRef(userId))];
  if (peerUserId) {
    tasks.push(remove(child(userCallRef(peerUserId), "offer")));
    tasks.push(remove(child(userCallRef(peerUserId), "answer")));
    tasks.push(remove(child(userCallRef(peerUserId), `candidates/${userId}`)));
    tasks.push(remove(child(userCallRef(peerUserId), "rejected")));
  }
  await Promise.all(tasks);
}

export async function hasActiveIncomingOffer(userId: string) {
  const snapshot = await get(child(userCallRef(userId), "offer"));
  return snapshot.exists();
}
