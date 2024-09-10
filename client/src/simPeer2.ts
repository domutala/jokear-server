class SignalingChannel {
  send(message: string) {
    // Envoie un message via le canal de signalisation (websocket ou autre)
  }

  onmessage: ((evt: MessageEvent) => void) | null = null;
}

let signalingChannel = new SignalingChannel();
let pc: RTCPeerConnection | null = null;

// Fonction appelée lors de la création d'une SessionDescription
const offerCreated = (desc: RTCSessionDescriptionInit) => {
  if (pc) {
    // On l'enregistre sur le point local
    pc.setLocalDescription(desc)
      .then(() => {
        // On envoie l'offre à l'autre utilisateur
        signalingChannel.send(
          JSON.stringify({
            sdp: pc?.localDescription,
          })
        );
      })
      .catch(logError);
  }
};

// Fonction pour démarrer une conversation audio/vidéo
const startTalk = () => {
  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.example.org",
      },
    ],
  });

  // Lorsqu'on reçoit une nouvelle "route" possible, on l'envoie à l'autre utilisateur
  pc.onicecandidate = (evt: RTCPeerConnectionIceEvent) => {
    if (evt.candidate) {
      signalingChannel.send(
        JSON.stringify({
          candidate: evt.candidate,
        })
      );
    }
  };

  // Capturer la génération de l'offre
  pc.onnegotiationneeded = () => {
    if (pc) {
      pc.createOffer().then(offerCreated).catch(logError);
    }
  };

  // Quand on reçoit un flux vidéo, on l'injecte dans notre élément <video>
  pc.ontrack = (e: RTCTrackEvent) => {
    const videoElement = document.querySelector<HTMLVideoElement>("#video");
    if (videoElement) {
      videoElement.srcObject = e.streams[0];
    }
  };

  // Utiliser l'API media pour obtenir la vidéo et le son de l'utilisateur
  navigator.mediaDevices
    .getUserMedia({
      audio: true,
      video: true,
    })
    .then((stream) => {
      const myVideo = document.querySelector<HTMLVideoElement>("#maVideo");
      if (myVideo) {
        myVideo.srcObject = stream;
      }
      stream.getTracks().forEach((track) => {
        pc?.addTrack(track, stream);
      });
    })
    .catch(logError);
};

// Quand on reçoit un message de l'autre utilisateur
signalingChannel.onmessage = (evt: MessageEvent) => {
  if (!pc) {
    startTalk();
  }
  const message = JSON.parse(evt.data);
  if (message.sdp) {
    pc?.setRemoteDescription(new RTCSessionDescription(message.sdp))
      .then(() => {
        if (pc?.remoteDescription?.type === "offer") {
          pc.createAnswer().then(offerCreated).catch(logError);
        }
      })
      .catch(logError);
  } else if (message.candidate) {
    pc?.addIceCandidate(new RTCIceCandidate(message.candidate)).catch(logError);
  }
};

// L'auteur de l'appel appellera la méthode startTalk() dès le démarrage

function logError(error: any) {
  console.error("Error: ", error);
}
