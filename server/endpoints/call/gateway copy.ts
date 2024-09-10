import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { from } from "rxjs";
import { map } from "rxjs/operators";
import * as mediasoup from "mediasoup";

@WebSocketGateway()
export class CallGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer() server: Server;

  worker: mediasoup.types.Worker;
  rooms: {
    [x: string]: {
      router: mediasoup.types.Router<mediasoup.types.AppData>;
      peers: string[];
    };
  } = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
  peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
  transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
  producers = []; // [ { socketId1, roomName1, producer, }, ... ]
  consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

  async afterInit(server: Server) {
    this.server = server;

    this.worker = await mediasoup.createWorker({
      logLevel: "error",
      logTags: [],
      dtlsCertificateFile: "",
      dtlsPrivateKeyFile: "",
      rtcMinPort: 2000,
      rtcMaxPort: 2020,
    });
    // console.log(`worker pid ${worker.pid}`);

    // worker.on("died", (error) => {
    //   // This implies something serious happened, so kill the application
    //   console.error("mediasoup worker has died", error);
    //   setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
    // });
  }

  handleConnection(socket: Socket) {
    // console.log(`Client connecté : ${socket.id}`);
    socket.emit("connection-success", { socketId: socket.id });
  }
}
