import { useCallback, useEffect, useRef, useState } from "react";

// Screen sharing for 1:1 and group calls.
//
// Uses getDisplayMedia + RTCRtpSender.replaceTrack on each peer connection's
// existing VIDEO sender, so there's no renegotiation. The browser's own
// "Stop sharing" bar fires the track's `ended` event, which we handle.
// `supported` is false where getDisplayMedia doesn't exist (most mobile
// browsers) - callers hide the button.
//
// getPeerConnections: () => RTCPeerConnection[]
// getCameraTrack:     () => MediaStreamTrack | null   (restored when sharing stops)
// onChange:           (sharing: boolean) => void      (e.g. tell the peer(s))
export default function useScreenShare({ getPeerConnections, getCameraTrack, onChange }) {
  const [sharing, setSharing] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const [error, setError] = useState("");
  const trackRef = useRef(null);
  const cbs = useRef({ getPeerConnections, getCameraTrack, onChange });
  cbs.current = { getPeerConnections, getCameraTrack, onChange };

  const supported =
    typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";

  const videoSenders = () =>
    cbs.current
      .getPeerConnections()
      .flatMap((pc) => pc.getTransceivers())
      .filter((t) => t.receiver?.track?.kind === "video" || t.sender?.track?.kind === "video")
      .map((t) => t.sender);

  const stop = useCallback(async () => {
    const track = trackRef.current;
    if (!track) return;
    trackRef.current = null;
    track.onended = null;
    track.stop();
    const camera = cbs.current.getCameraTrack();
    await Promise.all(videoSenders().map((s) => s.replaceTrack(camera || null).catch(() => {})));
    setPreviewStream(null);
    setSharing(false);
    cbs.current.onChange?.(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (!supported || trackRef.current) return;
    setError("");
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    } catch (err) {
      // The person cancelling the picker isn't an error worth showing.
      if (err?.name !== "NotAllowedError" && err?.name !== "AbortError") setError("Couldn't start screen sharing.");
      return;
    }
    const track = stream.getVideoTracks()[0];
    const senders = videoSenders();
    if (!track || senders.length === 0) {
      track?.stop();
      setError("Screen sharing isn't available in this call.");
      return;
    }
    trackRef.current = track;
    await Promise.all(senders.map((s) => s.replaceTrack(track).catch(() => {})));
    // The browser's own "Stop sharing" button.
    track.onended = () => stop();
    setPreviewStream(stream);
    setSharing(true);
    cbs.current.onChange?.(true);
  }, [supported, stop]);

  useEffect(
    () => () => {
      // Leaving the call: just release the capture (peers are being torn down).
      trackRef.current?.stop();
      trackRef.current = null;
    },
    []
  );

  return { supported, sharing, previewStream, error, start, stop };
}
