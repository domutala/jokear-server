import "./style.css";

import { io } from "socket.io-client";
import * as mediasoupClient from "mediasoup-client";

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
<div id="video">
  <table class="mainTable">
      <tbody>
          <tr>
              <td class="localColumn">
                  <video id="localVideo" autoplay class="video" muted ></video>
              </td>
              <td class="remoteColumn">
                  <div id="videoContainer"></div>
              </td>
          </tr>
      </tbody>
  </table>
  <table>
      <tbody>
          <tr>
              <td>

              </td>
          </tr>
      </tbody>
  </table>
</div> 
`;

async function bootstrap() {
  const socket = io("http://localhost:8055", { autoConnect: false });
  const roomName = Math.random().toString().substring(2, 22);
  const videoContainer = document.querySelector(
    "#videoContainer"
  ) as HTMLElement;

  let device: mediasoupClient.Device;
  let rtpCapabilities: mediasoupClient.types.RtpCapabilities;
  let producerTransport: mediasoupClient.types.Transport<mediasoupClient.types.AppData>;
  let consumerTransports: any[] = [];

  let audioProducer: mediasoupClient.types.Producer<mediasoupClient.types.AppData>;
  let videoProducer: mediasoupClient.types.Producer<mediasoupClient.types.AppData>;

  let consumer;
  let isProducer = false;

  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerOptions
  // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
  let params = {
    // mediasoup params
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };

  let audioParams: MediaStream & { track: MediaStreamTrack } = {} as any;
  let videoParams: MediaStream & { track: MediaStreamTrack } = {
    params,
  } as any;
  let consumingTransports: string[] = [];

  // connexion
  await new Promise<void>((resolve, reject) => {
    socket.connect();
    socket.on("connect", () => {
      console.log("Connected to server:", socket.connected);
      resolve(); // Résoudre la promesse quand connecté
    });
    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      reject(err); // Rejeter la promesse en cas d'erreur
    });
  });

  // server informs the client of a new producer just joined
  socket.on("new-producer", ({ producerId }) =>
    signalNewConsumerTransport(producerId)
  );
  socket.on("producer-closed", ({ remoteProducerId }) => {
    // server notification is received when a producer is closed
    // we need to close the client-side consumer and associated transport
    const producerToClose = consumerTransports.find(
      (transportData) => transportData.producerId === remoteProducerId
    );
    producerToClose.consumerTransport.close();
    producerToClose.consumer.close();

    // remove the consumer transport from the list
    consumerTransports = consumerTransports.filter(
      (transportData) => transportData.producerId !== remoteProducerId
    );

    // remove the video div element
    videoContainer.removeChild(
      document.getElementById(`td-${remoteProducerId}`)!
    );
  });

  getLocalStream();

  function getLocalStream() {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      })
      .then(streamSuccess)
      .catch((error) => {
        console.log(error.message);
      });
  }

  function streamSuccess(stream: MediaStream) {
    // localVideo.srcObject = stream;

    audioParams = { ...audioParams, track: stream.getAudioTracks()[0] };
    videoParams = { ...videoParams, track: stream.getVideoTracks()[0] };

    joinRoom();
  }

  async function joinRoom() {
    socket.emit("joinRoom", { name: roomName }, (data: any) => {
      rtpCapabilities = data;
      createDevice();
    });
  }

  async function createDevice() {
    try {
      device = new mediasoupClient.Device();

      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
      // Loads the device with RTP capabilities of the Router (server side)
      await device.load({
        // see getRtpCapabilities() below
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("Device RTP Capabilities", device.rtpCapabilities);

      // once the device loads, create transport
      createSendTransport();
    } catch (error: any) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  }

  function createSendTransport() {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    // this is a call from Producer, so sender = true
    socket.emit(
      "createWebRtcTransport",
      { consumer: false },
      ({ params }: { params: any }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }
        // creates a new WebRTC Transport to send media
        // based on the server's producer transport params
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
        producerTransport = device.createSendTransport(params);

        // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
        // this event is raised when a first call to transport.produce() is made
        // see connectSendTransport() below
        producerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-connect', ...)
              await socket.emit("transport-connect", {
                dtlsParameters,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error: any) {
              errback(error);
            }
          }
        );

        producerTransport.on(
          "produce",
          async (parameters, callback, errback) => {
            try {
              // tell the server to create a Producer
              // with the following parameters and produce
              // and expect back a server side producer id
              // see server's socket.on('transport-produce', ...)
              socket.emit(
                "transport-produce",
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                },
                ({
                  id,
                  producersExist,
                }: {
                  id: string;
                  producersExist: any;
                }) => {
                  // Tell the transport that parameters were transmitted and provide it with the
                  // server side producer's id.
                  callback({ id });

                  // if producers exist, then join room
                  if (producersExist) getProducers();
                }
              );
            } catch (error: any) {
              errback(error);
            }
          }
        );

        connectSendTransport();
      }
    );
  }

  async function connectSendTransport() {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above

    audioProducer = await producerTransport.produce(audioParams);
    videoProducer = await producerTransport.produce(videoParams);

    audioProducer.on("trackended", () => {
      console.log("audio track ended");

      // close audio track
    });

    audioProducer.on("transportclose", () => {
      console.log("audio transport ended");

      // close audio track
    });

    videoProducer.on("trackended", () => {
      console.log("video track ended");

      // close video track
    });

    videoProducer.on("transportclose", () => {
      console.log("video transport ended");

      // close video track
    });
  }

  async function signalNewConsumerTransport(remoteProducerId: string) {
    console.log("yolé");
    //check if we are already consuming the remoteProducerId
    if (consumingTransports.includes(remoteProducerId)) return;
    consumingTransports.push(remoteProducerId);

    socket.emit(
      "createWebRtcTransport",
      { consumer: true },
      ({ params }: { params: any }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }
        console.log(`PARAMS... ${params}`);

        try {
          producerTransport = device.createRecvTransport(params);
        } catch (error) {
          // exceptions:
          // {InvalidStateError} if not loaded
          // {TypeError} if wrong arguments.
          console.log(error);
          return;
        }

        producerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await socket.emit("transport-recv-connect", {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error: any) {
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );

        connectRecvTransport(producerTransport, remoteProducerId, params.id);
      }
    );
  }

  const getProducers = () => {
    socket.emit("getProducers", {}, (producerIds: string[]) => {
      console.log("****----------", producerIds);
      // for each of the producer create a consumer
      // producerIds.forEach(id => signalNewConsumerTransport(id))
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  async function connectRecvTransport(
    consumerTransport: any,
    remoteProducerId: string,
    serverConsumerTransportId: string
  ) {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    socket.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({ params }: { params: any }) => {
        console.log(params);

        if (params.error) {
          console.log("Cannot Consume");
          return;
        }

        console.log(`Consumer Params ${params}`);
        // then consume with the local consumer transport
        // which creates a consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: remoteProducerId,
            consumer,
          },
        ];

        // create a new div element for the new consumer media
        const newElem = document.createElement("div");
        newElem.setAttribute("id", `td-${remoteProducerId}`);

        if (params.kind == "audio") {
          //append to the audio container
          newElem.innerHTML =
            '<audio id="' + remoteProducerId + '" autoplay></audio>';
        } else {
          //append to the video container
          newElem.setAttribute("class", "remoteVideo");
          newElem.innerHTML =
            '<video id="' +
            remoteProducerId +
            '" autoplay class="video" ></video>';
        }

        videoContainer.appendChild(newElem);

        // destructure and retrieve the video track from the producer
        const { track } = consumer;

        (document.getElementById(remoteProducerId) as any)!.srcObject =
          new MediaStream([track]);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        socket.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  }
}

bootstrap();
