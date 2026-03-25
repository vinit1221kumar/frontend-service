'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  joinVideoRoom,
  leaveVideoRoom,
  sendVideoSignal,
  subscribeToRoomPresence,
  subscribeToVideoSignals
} from '../services/firebaseVideo';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

export function useVideoCall({ userId, roomId }) {
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const statusRef = useRef('idle');

  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const cleanupPeer = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    setRemoteStream(null);
  }, []);

  const stopMedia = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const leaveCall = useCallback(() => {
    if (roomId && userId) {
      leaveVideoRoom({ roomId: roomId.trim(), userId }).catch(() => undefined);
    }
    cleanupPeer();
    stopMedia();
    setStatus('idle');
    setError('');
    seenSignalsRef.current.clear();
  }, [roomId, userId, cleanupPeer, stopMedia]);

  const buildPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.ontrack = (ev) => {
      const [stream] = ev.streams;
      if (stream) setRemoteStream(stream);
    };

    pc.onconnectionstatechange = () => {
      const st = pc.connectionState;
      if (st === 'connected') setStatus('connected');
      if (st === 'failed') setError('Connection failed — try leaving and rejoining.');
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate && roomId && userId) {
        sendVideoSignal({
          roomId,
          fromUserId: userId,
          signal: { type: 'ice', candidate: ev.candidate.toJSON() }
        }).catch(() => undefined);
      }
    };

    return pc;
  }, [roomId, userId]);

  const attachLocalToPc = useCallback(
    (pc) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    },
    []
  );

  const joinCall = useCallback(async () => {
    if (!roomId?.trim() || !userId) {
      setError('Missing room or user.');
      return;
    }
    setError('');
    setStatus('joining');
    try {
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: true
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
      }
      const rid = roomId.trim();
      const { role } = await joinVideoRoom({ roomId: rid, userId });

      cleanupPeer();
      const pc = buildPeerConnection();
      attachLocalToPc(pc);

      if (role === 'caller') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendVideoSignal({
          roomId: rid,
          fromUserId: userId,
          signal: { type: 'offer', sdp: pc.localDescription.sdp }
        });
        setStatus('calling');
      } else {
        setStatus('waiting');
      }
    } catch (e) {
      setError(e.message || 'Could not access camera or microphone.');
      setStatus('error');
    }
  }, [roomId, userId, attachLocalToPc, buildPeerConnection, cleanupPeer]);

  useEffect(() => {
    if (!roomId?.trim() || !userId) return;

    const rid = roomId.trim();

    const onSignal = async ({ id, fromUserId, type, sdp, candidate }) => {
      if (!fromUserId || fromUserId === userId) return;
      if (!type) return;
      if (seenSignalsRef.current.has(id)) return;
      seenSignalsRef.current.add(id);

      let pc = pcRef.current;

      if (type === 'ice' && candidate) {
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          /* ignore stale ICE */
        }
        return;
      }

      if (type === 'offer') {
        if (!pc) {
          const stream = localStreamRef.current;
          if (!stream) return;
          pc = buildPeerConnection();
          attachLocalToPc(pc);
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendVideoSignal({
            roomId: rid,
            fromUserId: userId,
            signal: { type: 'answer', sdp: pc.localDescription.sdp }
          });
          setStatus('connected');
        } catch (e) {
          setError(e.message || 'Failed to answer call');
          setStatus('error');
        }
        return;
      }

      if (type === 'answer' && pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
          setStatus('connected');
        } catch (e) {
          setError(e.message || 'Failed to complete connection');
          setStatus('error');
        }
      }
    };

    const offSignals = subscribeToVideoSignals({ roomId: rid, onSignal });
    const offPresence = subscribeToRoomPresence({
      roomId: rid,
      currentUserId: userId,
      onPeerLeft: () => {
        if (statusRef.current === 'idle') return;
        cleanupPeer();
        setStatus('peer_left');
        setRemoteStream(null);
      }
    });

    return () => {
      offSignals();
      offPresence();
    };
  }, [roomId, userId, buildPeerConnection, attachLocalToPc, cleanupPeer]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setMicOn(audio.enabled);
    }
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const video = stream.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setCamOn(video.enabled);
    }
  }, []);

  return {
    localStream,
    remoteStream,
    status,
    error,
    micOn,
    camOn,
    joinCall,
    leaveCall,
    toggleMic,
    toggleCam
  };
}
