import "./style.css";
import typescriptLogo from "./typescript.svg";
import viteLogo from "/vite.svg";

import * as socketProvider from "./socketProvider.ts";
import peer from "./peer.ts";

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

  async function call() {
    // const stream = await navigator.mediaDevices.getUserMedia({
    //   audio: true,
    //   video: true,
    // });

    const offer = await peer.getOffer();
    console.log(offer);

    socket.emit("call:emit", { offer });
  }

  async function incommingCall(data: { from: string; offer: any }) {
    // setRemoteSocketId(from);
    // const stream = await navigator.mediaDevices.getUserMedia({
    //   audio: true,
    //   video: true,
    // });
    // setMyStream(stream);
    console.log(`Incoming Call`, data);
    const ans = await peer.getAnswer(data.offer);
    socket.emit("call:accepted", { to: data.from, ans });
  }

  socket.on("call:incomming", incommingCall);

  const btn = document.querySelector<HTMLButtonElement>("#counter")!;
  btn.addEventListener("click", () => call());
}

bootstrap();
