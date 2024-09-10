import "./style.css";
import typescriptLogo from "./typescript.svg";
import viteLogo from "/vite.svg";

import * as socketProvider from "./socketProvider.ts";

// import SimplePeer from "simple-peer";
//@ts-ignore
import SimplePeer from "simple-peer/simplepeer.min.js";
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <style>
    #outgoing {
      width: 600px;
      word-wrap: break-word;
      white-space: normal;
    }
  </style>
  <form>
    <textarea id="incoming"></textarea>
    <button type="submit">submit</button>
  </form>
  <pre id="outgoing"></pre>

  <div>
    <a href="https://vitejs.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button">call</button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`;

// setupCounter(document.querySelector<HTMLButtonElement>("#counter")!);

async function bootstrap() {
  const socket = await socketProvider.connect();

  const btn = document.querySelector<HTMLButtonElement>("#counter")!;
  btn.addEventListener("click", () => startCall());
  async function startCall() {
    let roomId = "";
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    const peer = new SimplePeer({
      initiator: false,
      trickle: false,
    });

    peer.addStream(stream);

    peer.on("signal", (data: any) => {
      // if (data.type !== "answer")
      socket.emit("signal", { roomId, data });
      console.log("Client signal:", data);
    });

    peer.on("connect", () => {
      console.log("Connexion WebRTC établie");
    });

    socket.on("signal", (data: any) => {
      peer.signal(data);
    });

    socket.emit("call:start", {}, (data: any) => {
      roomId = data.roomId;
    });
  }

  async function call() {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    const peer = new SimplePeer({
      // initiator: true,
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on("signal", (data: any) => {
      console.log("Client signal:", data);
      // this.socket.emit('signal', data);
    });

    // Gestion de l'événement connect (connexion WebRTC établie)
    peer.on("connect", () => {
      console.log("Connexion WebRTC établie");
    });

    // Affiche les messages reçus du serveur via WebRTC
    peer.on("data", (data: any) => {
      console.log("Message reçu du serveur:", data.toString());
    });

    // socket.on("call:accepted", (data: { from: string; offer: any }) => {
    //   peer.signal(data.offer);
    // });

    // peer.on("connect", () => {
    //   console.log("alice connected to Peer1");
    // });

    // peer.on("signal", (offer: any) => {
    //   if (offer.type === "offer") socket.emit("call:emit", { offer });
    // });
  }

  socket.on("call:incomming", incommingCall);
  async function incommingCall(data: { from: string; offer: any }) {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false,
    });

    peer.on("signal", (offer: any) => {
      if (offer.type === "offer") {
        socket.emit("call:accepted", { offer, to: data.from });
      }
    });

    // peer.signal(data.offer);
  }
}

bootstrap();
