import { io, Socket } from "socket.io-client";

const socket = io("http://10.0.1.24:8055", { autoConnect: false });
// const socket = io("http://localhost:8450", { autoConnect: false });

export function connect() {
  return new Promise<Socket>((resolve, reject) => {
    if (!socket.connected) socket.connect();
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", (err) => reject(err));
  });
}

export function useSocket() {
  return socket;
}
