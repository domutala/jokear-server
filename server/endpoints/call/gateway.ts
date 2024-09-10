import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import * as mediasoup from "mediasoup";

@WebSocketGateway()
export class CallGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() server: Server;

  worker: mediasoup.types.Worker;
  rooms: {
    [x: string]: {
      router: mediasoup.types.Router<mediasoup.types.AppData>;
      peers: string[];
    };
  } = {}; // { roomName1: { Router, rooms: [ sicketId1, ... ] }, ...}
  peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2,] }, producers = [id1, id2,] }, consumers = [id1, id2,], peerDetails }, ...}
  transports: {
    socketId: string;
    transport: mediasoup.types.WebRtcTransport<mediasoup.types.AppData>;
    roomName: string;
    consumer: any;
  }[] = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
  producers = []; // [ { socketId1, roomName1, producer, }, ... ]
  consumers = []; // [ { socketId1, roomName1, consumer, }, ... ]

  async afterInit(server: Server) {
    this.server = server;

    const createWorker = async () => {
      const worker = await mediasoup.createWorker({
        logLevel: "error",
        logTags: [],
        dtlsCertificateFile: "",
        dtlsPrivateKeyFile: "",
        rtcMinPort: 40000,
        rtcMaxPort: 49999,
      });
      // console.log(`worker pid ${worker.pid}`);

      // worker.on("died", (error) => {
      //   // This implies something serious happened, so kill the application
      //   console.error("mediasoup worker has died", error);
      //   setTimeout(() => process.exit(1), 2000); // exit in 2 seconds
      // });

      return worker;
    };

    this.worker = await createWorker();
  }

  handleConnection(socket: Socket) {
    // console.log(`Client connecté : ${socket.id}`);
    socket.emit("connection-success", { socketId: socket.id });
  }

  handleDisconnect(socket: Socket) {
    // do some cleanup
    console.log("peer disconnected", socket.id);
    this.consumers = this.removeItems(
      socket,
      this.consumers,
      socket.id,
      "consumer",
    );
    this.producers = this.removeItems(
      socket,
      this.producers,
      socket.id,
      "producer",
    );
    this.transports = this.removeItems(
      socket,
      this.transports,
      socket.id,
      "transport",
    );

    const peer = this.peers[socket.id];
    if (peer) {
      const roomName = peer.roomName;
      delete this.peers[socket.id];

      const peers = this.rooms[roomName].peers.filter(
        (socketId) => socketId !== socket.id,
      );

      this.rooms[roomName].peers = peers;
    }
  }

  // Gère la déconnexion d'un client

  @SubscribeMessage("joinRoom")
  async joinRoom(@MessageBody() data: any, @ConnectedSocket() socket: Socket) {
    const mediaCodecs: mediasoup.types.RtpCodecCapability[] = [
      {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        parameters: {
          "x-google-start-bitrate": 1000,
        },
      },
    ];

    const createRoom = async (roomName: string, socketId: string) => {
      // worker.createRouter(options)
      // options = { mediaCodecs, appData }
      // mediaCodecs -> defined above
      // appData -> custom application data - we are not supplying any
      // none of the two are required
      let router1: mediasoup.types.Router;
      let peers = [];
      if (this.rooms[roomName]) {
        router1 = this.rooms[roomName].router;
        peers = this.rooms[roomName].peers || [];
      } else {
        router1 = await this.worker.createRouter({ mediaCodecs });
      }
      // console.log(`Router ID: ${router1.id}`, peers.length);
      this.rooms[roomName] = {
        router: router1,
        peers: [...peers, socketId],
      };
      return router1;
    };

    const roomName = data.name;

    const router1 = await createRoom(roomName, socket.id);
    this.peers[socket.id] = {
      socket,
      roomName, // Name for the Router this Peer joined
      transports: [],
      producers: [],
      consumers: [],
      peerDetails: {
        name: "",
        isAdmin: false, // Is this Peer the Admin?
      },
    };
    // get Router RTP Capabilities
    const rtpCapabilities = router1.rtpCapabilities;
    // call callback from the client and send back the rtpCapabilities
    // callback({ rtpCapabilities });

    socket.emit("joinRoom", rtpCapabilities);
    return rtpCapabilities;
  }

  @SubscribeMessage("createWebRtcTransport")
  async createWebRtcTransport(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // get Room Name from Peer's properties
    const roomName = this.peers[socket.id].roomName;

    // get Router (Room) object this peer is in based on RoomName
    const router = this.rooms[roomName].router;

    const transport = await _createWebRtcTransport(router);

    this.addTransport(transport, roomName, data.consumer, socket);

    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      },
    };

    async function _createWebRtcTransport(
      router: mediasoup.types.Router<mediasoup.types.AppData>,
    ) {
      return new Promise<
        mediasoup.types.WebRtcTransport<mediasoup.types.AppData>
      >(async (resolve, reject) => {
        try {
          // https://mediasoup.org/documentation/v3/mediasoup/api/#WebRtcTransportOptions
          const webRtcTransport_options = {
            listenIps: [
              {
                ip: "0.0.0.0", // replace with relevant IP address
                announcedIp: "10.0.0.115",
              },
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
          };

          // https://mediasoup.org/documentation/v3/mediasoup/api/#router-createWebRtcTransport
          const transport = await router.createWebRtcTransport(
            webRtcTransport_options,
          );
          // console.log(`transport id: ${transport.id}`);

          transport.on("dtlsstatechange", (dtlsState) => {
            if (dtlsState === "closed") {
              transport.close();
            }
          });

          // TODO: @close
          transport.on("close" as any, () => {
            // console.log("transport closed");
          });

          resolve(transport);
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  private removeItems(
    socket: Socket,
    items: any[],
    socketId: string,
    type: string,
  ) {
    items.forEach((item) => {
      if (item.socketId === socket.id) {
        item[type].close();
      }
    });
    items = items.filter((item) => item.socketId !== socket.id);

    return items;
  }

  private addTransport(
    transport: mediasoup.types.WebRtcTransport<mediasoup.types.AppData>,
    roomName: string,
    consumer: any,
    socket: Socket,
  ) {
    const e = { socketId: socket.id, transport, roomName, consumer };
    this.transports = [
      ...this.transports,
      { socketId: socket.id, transport, roomName, consumer },
    ];

    this.peers[socket.id] = {
      ...this.peers[socket.id],
      transports: [...this.peers[socket.id].transports, transport.id],
    };
  }

  private getTransport(socketId: string) {
    const [producerTransport] = this.transports.filter(
      (transport) => transport.socketId === socketId && !transport.consumer,
    );
    return producerTransport.transport;
  }

  private addProducer(socket: Socket, producer: any, roomName: string) {
    this.producers = [
      ...this.producers,
      { socketId: socket.id, producer, roomName },
    ];

    this.peers[socket.id] = {
      ...this.peers[socket.id],
      producers: [...this.peers[socket.id].producers, producer.id],
    };
  }

  private informConsumers(roomName: string, socketId: string, id: string) {
    // console.log(`just joined, id ${id} ${roomName}, ${socketId}`);
    // A new producer just joined
    // let all consumers to consume this producer
    this.producers.forEach((producerData) => {
      if (
        producerData.socketId !== socketId &&
        producerData.roomName === roomName
      ) {
        const producerSocket = this.peers[producerData.socketId].socket;
        // use socket to send producer id to producer
        producerSocket.emit("new-producer", { producerId: id });
      }
    });
  }

  private addConsumer(socket: Socket, consumer, roomName: string) {
    // add the consumer to the consumers list
    this.consumers = [
      ...this.consumers,
      { socketId: socket.id, consumer, roomName },
    ];

    // add the consumer id to the peers list
    this.peers[socket.id] = {
      ...this.peers[socket.id],
      consumers: [...this.peers[socket.id].consumers, consumer.id],
    };
  }

  @SubscribeMessage("getProducers")
  getProducers(@ConnectedSocket() socket: Socket) {
    const { roomName } = this.peers[socket.id];

    let producerList = [];
    for (const producerData of this.producers) {
      if (
        producerData.socketId !== socket.id &&
        producerData.roomName === roomName
      ) {
        producerList = [...producerList, producerData.producer.id];
      }
    }

    // return the producer list back to the client
    return producerList;
  }

  @SubscribeMessage("transport-connect")
  async transportConnect(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // console.log("DTLS PARAMS... ", { dtlsParameters: data.dtlsParameters });

    await this.getTransport(socket.id).connect({
      dtlsParameters: data.dtlsParameters,
    });
  }

  @SubscribeMessage("transport-produce")
  async transportProduce(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // call produce based on the prameters from the client
    const producer = await this.getTransport(socket.id).produce({
      kind: data.kind,
      rtpParameters: data.rtpParameters,
    });

    // add producer to the producers array
    const { roomName } = this.peers[socket.id];

    this.addProducer(socket, producer, roomName);

    this.informConsumers(roomName, socket.id, producer.id);

    // console.log("Producer ID: ", producer.id, producer.kind);

    producer.on("transportclose", () => {
      // console.log("transport for this producer closed ");
      producer.close();
    });

    // Send back to the client the Producer's id
    return {
      id: producer.id,
      producersExist: this.producers.length > 1 ? true : false,
    };
  }

  // see client's socket.emit('transport-recv-connect', ...)
  @SubscribeMessage("transport-recv-connect")
  async transportRecvConnect(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // console.log(`DTLS PARAMS: ${data.dtlsParameters}`);
    const consumerTransport = this.transports.find(
      (transportData) =>
        transportData.consumer &&
        transportData.transport.id == data.serverConsumerTransportId,
    ).transport;
    await consumerTransport.connect({ dtlsParameters: data.dtlsParameters });
  }

  @SubscribeMessage("consume")
  async consume(@MessageBody() data: any, @ConnectedSocket() socket: Socket) {
    try {
      const { roomName } = this.peers[socket.id];
      const router = this.rooms[roomName].router;
      const consumerTransport = this.transports.find(
        (transportData) =>
          transportData.consumer &&
          transportData.transport.id == data.serverConsumerTransportId,
      ).transport;

      // check if the router can consume the specified producer
      if (
        router.canConsume({
          producerId: data.remoteProducerId,
          rtpCapabilities: data.rtpCapabilities,
        })
      ) {
        // transport can now consume and return a consumer
        const consumer = await consumerTransport.consume({
          producerId: data.remoteProducerId,
          rtpCapabilities: data.rtpCapabilities,
          paused: true,
        });

        consumer.on("transportclose", () => {
          // console.log("transport close from consumer");
        });

        consumer.on("producerclose", () => {
          // console.log("producer of consumer closed");
          socket.emit("producer-closed", {
            remoteProducerId: data.remoteProducerId,
          });

          // consumerTransport.close([]);
          consumerTransport.close();
          this.transports = this.transports.filter(
            (transportData) =>
              transportData.transport.id !== consumerTransport.id,
          );
          consumer.close();
          this.consumers = this.consumers.filter(
            (consumerData) => consumerData.consumer.id !== consumer.id,
          );
        });

        this.addConsumer(socket, consumer, roomName);

        // from the consumer extract the following params
        // to send back to the Client
        const params = {
          id: consumer.id,
          producerId: data.remoteProducerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          serverConsumerId: consumer.id,
        };

        // send the parameters to the client
        return { params };
      }
    } catch (error) {
      // console.log(error.message);
      return { params: { error: error } };
    }
  }

  @SubscribeMessage("consumer-resume")
  async consumerResume(
    @MessageBody() data: any,
    @ConnectedSocket() socket: Socket,
  ) {
    // console.log("consumer resume");
    const { consumer } = this.consumers.find(
      (consumerData) => consumerData.consumer.id === data.serverConsumerId,
    );
    await consumer.resume();
  }
}
