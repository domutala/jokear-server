//@ts-ignore
import SimplePeer from "simple-peer/simplepeer.min.js";

export default function () {
  // Déclaration des types pour les éléments HTML
  const outgoingElement = document.querySelector("#outgoing") as HTMLElement;
  const incomingElement = document.querySelector(
    "#incoming"
  ) as HTMLInputElement;
  const formElement = document.querySelector("form") as HTMLFormElement;

  const p = new SimplePeer({
    initiator: window.location.hash === "#1",
    trickle: false,
  });

  p.on("error", (err: Error) => console.log("error", err));

  p.on("signal", (data: SimplePeer.SignalData) => {
    console.log("SIGNAL", JSON.stringify(data));
    if (outgoingElement) {
      outgoingElement.textContent = JSON.stringify(data);
    }
  });

  formElement.addEventListener("submit", (ev: Event) => {
    ev.preventDefault();
    if (incomingElement) {
      p.signal(JSON.parse(incomingElement.value));
    }
  });

  p.on("connect", () => {
    console.log("CONNECT");
    p.send("whatever" + Math.random());
  });

  p.on("data", (data: any) => {
    console.log("data: " + data);
  });
}
