"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import {
  acceptCall,
  clearIceCandidates,
  endCall,
  listenForAnswer,
  listenForIceCandidates,
  listenForIncomingCall,
  listenForRejection,
  publishIceCandidate,
  rejectCall,
  startCall,
} from "@/lib/call";
import {
  addIceCandidate,
  attachLocalTracks,
  cleanupPeerConnection,
  createAnswer,
  createOffer,
  createPeerConnection,
  setRemoteDescription,
} from "@/lib/webrtc";
import { CallMode, ConnectionStatus, OfferPayload } from "@/types/call";

type UnsubscribeFn = () => void;

function createRingtonePlayer() {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let audioContext: AudioContext | null = null;

  function beep() {
    if (!audioContext) audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 840;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.18);
  }

  return {
    start() {
      if (intervalId) return;
      beep();
      intervalId = setInterval(beep, 1200);
    },
    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}

export default function CallUI() {
  const auth = useAuthContext();
  const currentUserId = auth?.user?.id as string | undefined;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const unsubscribeRefs = useRef<UnsubscribeFn[]>([]);
  const ringtoneRef = useRef(createRingtonePlayer());

  const [calleeId, setCalleeId] = useState("");
  const [peerId, setPeerId] = useState<string | null>(null);
  const [callMode, setCallMode] = useState<CallMode>("video");
  const [incomingOffer, setIncomingOffer] = useState<OfferPayload | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);

  const hasIncomingCall = Boolean(incomingOffer);

  const stopAllTracks = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const clearMediaElements = useCallback(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
  }, []);

  const detachListeners = useCallback(() => {
    unsubscribeRefs.current.forEach((unsubscribe) => unsubscribe());
    unsubscribeRefs.current = [];
  }, []);

  const hardCleanup = useCallback(async () => {
    ringtoneRef.current.stop();
    detachListeners();
    cleanupPeerConnection(peerConnectionRef.current);
    peerConnectionRef.current = null;
    stopAllTracks();
    clearMediaElements();
    setIncomingOffer(null);
    setPeerId(null);
    setConnectionState("new");
    setMicEnabled(true);
    setCameraEnabled(true);
  }, [clearMediaElements, detachListeners, stopAllTracks]);

  const setupMedia = useCallback(
    async (mode: CallMode) => {
      setStatus("requesting-media");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mode === "video",
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        return stream;
      } catch (mediaError) {
        console.error("Failed to get user media", mediaError);
        throw new Error(
          "Could not access microphone/camera. Please verify permissions."
        );
      }
    },
    []
  );

  const setupPeerConnection = useCallback(
    (userId: string, targetPeerId: string) => {
      const remoteStream = new MediaStream();
      remoteStreamRef.current = remoteStream;
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      }

      const peerConnection = createPeerConnection({
        senderUserId: userId,
        onIceCandidate: async (candidate) => {
          try {
            await publishIceCandidate({
              targetUserId: targetPeerId,
              fromUserId: userId,
              candidate,
            });
          } catch (candidateError) {
            console.error("Failed to publish ICE candidate", candidateError);
          }
        },
        onTrack: (event) => {
          event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track));
        },
        onConnectionStateChange: (state) => {
          setConnectionState(state);
          if (state === "connected") {
            setStatus("connected");
          } else if (state === "failed" || state === "disconnected") {
            setStatus("failed");
            setError("Connection failed or disconnected.");
          }
        },
      });

      peerConnectionRef.current = peerConnection;
      return peerConnection;
    },
    []
  );

  const subscribeForRemoteIce = useCallback((userId: string, fromUserId: string) => {
    const unsubscribe = listenForIceCandidates({
      userId,
      fromUserId,
      onCandidate: async (candidate) => {
        try {
          if (!peerConnectionRef.current) return;
          await addIceCandidate(peerConnectionRef.current, candidate);
        } catch (addError) {
          console.error("Failed to add remote ICE candidate", addError);
        }
      },
    });
    unsubscribeRefs.current.push(unsubscribe);
  }, []);

  const beginCall = useCallback(async () => {
    if (!currentUserId) {
      setError("You must be logged in to start a call.");
      return;
    }
    if (!calleeId.trim()) {
      setError("Enter a callee ID.");
      return;
    }

    setError(null);
    setIsBusy(true);
    const targetUserId = calleeId.trim();

    try {
      const stream = await setupMedia(callMode);
      const peerConnection = setupPeerConnection(currentUserId, targetUserId);
      attachLocalTracks(peerConnection, stream);

      const offer = await createOffer(peerConnection);
      await startCall({
        callerId: currentUserId,
        calleeId: targetUserId,
        offer,
        mode: callMode,
      });

      const unsubscribeAnswer = listenForAnswer(currentUserId, async (answer) => {
        if (!answer || !peerConnectionRef.current) return;
        await setRemoteDescription(peerConnectionRef.current, answer);
        setStatus("connecting");
      });
      const unsubscribeRejected = listenForRejection(currentUserId, async (rejected) => {
        if (!rejected) return;
        setError(`Call rejected by ${rejected.byUserId}.`);
        await endCall({ userId: currentUserId, peerUserId: targetUserId });
        await hardCleanup();
        setStatus("ended");
      });

      unsubscribeRefs.current.push(unsubscribeAnswer, unsubscribeRejected);
      subscribeForRemoteIce(currentUserId, targetUserId);
      setPeerId(targetUserId);
      setStatus("calling");
    } catch (startError) {
      console.error("Failed to start call", startError);
      setError(startError instanceof Error ? startError.message : "Failed to start call.");
      await hardCleanup();
      setStatus("failed");
    } finally {
      setIsBusy(false);
    }
  }, [
    callMode,
    calleeId,
    currentUserId,
    hardCleanup,
    setupMedia,
    setupPeerConnection,
    subscribeForRemoteIce,
  ]);

  const acceptIncomingCall = useCallback(async () => {
    if (!currentUserId || !incomingOffer) return;

    setError(null);
    setIsBusy(true);
    ringtoneRef.current.stop();

    try {
      const callerId = incomingOffer.fromUserId;
      const stream = await setupMedia(incomingOffer.mode);
      const peerConnection = setupPeerConnection(currentUserId, callerId);
      attachLocalTracks(peerConnection, stream);
      await setRemoteDescription(peerConnection, incomingOffer);

      const answer = await createAnswer(peerConnection);
      await acceptCall({ userId: currentUserId, callerId, answer });
      subscribeForRemoteIce(currentUserId, callerId);

      setPeerId(callerId);
      setIncomingOffer(null);
      setCallMode(incomingOffer.mode);
      setStatus("connecting");
    } catch (acceptError) {
      console.error("Failed to accept call", acceptError);
      setError(acceptError instanceof Error ? acceptError.message : "Failed to accept call.");
      await hardCleanup();
      setStatus("failed");
    } finally {
      setIsBusy(false);
    }
  }, [currentUserId, hardCleanup, incomingOffer, setupMedia, setupPeerConnection, subscribeForRemoteIce]);

  const rejectIncomingCall = useCallback(async () => {
    if (!currentUserId || !incomingOffer) return;
    try {
      await rejectCall({ userId: currentUserId, callerId: incomingOffer.fromUserId });
      ringtoneRef.current.stop();
      setIncomingOffer(null);
      setStatus("ended");
    } catch (rejectError) {
      console.error("Failed to reject call", rejectError);
      setError("Could not reject incoming call.");
    }
  }, [currentUserId, incomingOffer]);

  const leaveCall = useCallback(async () => {
    if (!currentUserId) return;
    try {
      await endCall({ userId: currentUserId, peerUserId: peerId });
      if (peerId) {
        await clearIceCandidates(currentUserId, peerId);
      }
    } catch (endError) {
      console.error("Failed to end call", endError);
    } finally {
      await hardCleanup();
      setStatus("ended");
    }
  }, [currentUserId, hardCleanup, peerId]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextEnabled = !micEnabled;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setMicEnabled(nextEnabled);
  }, [micEnabled]);

  const toggleCamera = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const nextEnabled = !cameraEnabled;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled;
    });
    setCameraEnabled(nextEnabled);
  }, [cameraEnabled]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsubscribeIncoming = listenForIncomingCall(currentUserId, (offer) => {
      if (!offer) {
        setIncomingOffer(null);
        return;
      }
      setIncomingOffer(offer);
      setCallMode(offer.mode);
      setPeerId(offer.fromUserId);
      setStatus("ringing");
      ringtoneRef.current.start();
    });
    unsubscribeRefs.current.push(unsubscribeIncoming);

    return () => {
      unsubscribeIncoming();
      hardCleanup().catch(() => undefined);
    };
  }, [currentUserId, hardCleanup]);

  const canToggleCamera = Boolean(localStreamRef.current?.getVideoTracks().length);

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-900">RTDB WebRTC Call</h1>
      <p className="text-sm text-slate-600">
        Your user ID: <span className="font-mono">{currentUserId ?? "Not signed in"}</span>
      </p>

      <div className="grid gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Callee ID</span>
          <input
            value={calleeId}
            onChange={(e) => setCalleeId(e.target.value)}
            placeholder="Enter callee user ID"
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">Call Mode</span>
          <select
            value={callMode}
            onChange={(e) => setCallMode(e.target.value as CallMode)}
            className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-sky-500"
          >
            <option value="video">Video call</option>
            <option value="audio">Audio only</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={beginCall}
          disabled={isBusy || !currentUserId}
          className="rounded-md bg-sky-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Connecting..." : "Start Call"}
        </button>
        <button
          type="button"
          onClick={acceptIncomingCall}
          disabled={isBusy || !hasIncomingCall}
          className="rounded-md bg-emerald-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Accept Call
        </button>
        <button
          type="button"
          onClick={rejectIncomingCall}
          disabled={isBusy || !hasIncomingCall}
          className="rounded-md bg-amber-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Reject Call
        </button>
        <button
          type="button"
          onClick={leaveCall}
          disabled={!peerId}
          className="rounded-md bg-rose-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          End Call
        </button>
        <button
          type="button"
          onClick={toggleMic}
          disabled={!localStreamRef.current}
          className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {micEnabled ? "Mute Mic" : "Unmute Mic"}
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          disabled={!canToggleCamera}
          className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cameraEnabled ? "Turn Camera Off" : "Turn Camera On"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Local stream</p>
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full rounded bg-slate-900 object-cover"
          />
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-700">Remote stream</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="aspect-video w-full rounded bg-slate-900 object-cover"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
        <p>Status: {status}</p>
        <p>Peer connection: {connectionState}</p>
        {incomingOffer ? <p>Incoming from: {incomingOffer.fromUserId}</p> : null}
        {error ? <p className="mt-2 text-rose-600">{error}</p> : null}
      </div>
    </section>
  );
}
