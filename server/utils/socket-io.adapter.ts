import { HttpException, INestApplicationContext } from "@nestjs/common";
import { isFunction, isNil } from "@nestjs/common/utils/shared.utils";
import {
  AbstractWsAdapter,
  MessageMappingProperties,
} from "@nestjs/websockets";
import { DISCONNECT_EVENT } from "@nestjs/websockets/constants";
import { fromEvent, Observable, throwError } from "rxjs";
import {
  catchError,
  filter,
  first,
  map,
  mergeMap,
  share,
  takeUntil,
} from "rxjs/operators";
import { Server, Socket } from "socket.io";

export class SocketIoAdapter extends AbstractWsAdapter {
  constructor(appOrHttpServer?: INestApplicationContext | any) {
    super(appOrHttpServer);
  }

  public create(
    port: number,
    options?: any & { namespace?: string; server?: any },
  ): any {
    if (!options) {
      return this.createIOServer(port);
    }
    const { namespace, server, ...opt } = options;
    return server && isFunction(server.of)
      ? server.of(namespace)
      : namespace
        ? this.createIOServer(port, opt).of(namespace)
        : this.createIOServer(port, opt);
  }

  public createIOServer(port: number, options?: any): any {
    if (this.httpServer && port === 0) {
      const s = new Server(this.httpServer, {
        cors: {
          origin: "*",
          methods: ["GET", "POST"],
          credentials: true,
        },
        // Allow 1MB of data per request.
        maxHttpBufferSize: 1e6,
      });

      return s;
    }
    return new Server(port, options);
  }

  async bindMessageHandlers(
    socket: Socket,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    function sendError(error: any) {
      console.log(error);
      if (error instanceof HttpException) {
        return throwError(new Error(error.message));
      }

      if (typeof error === "string") return throwError(new Error(error));
      return throwError(new Error("internal_error"));
    }

    const disconnect$ = fromEvent(socket, DISCONNECT_EVENT).pipe(
      share(),
      first(),
    );

    handlers.forEach(async ({ message, callback }) => {
      const source$ = fromEvent(socket, message).pipe(
        // mergeMap(async (payload: any) => {
        //   socket.request.session = await this.decode(
        //     socket.request.headers.authorization,
        //   );

        //   return payload;
        // }),
        mergeMap((payload: any) => {
          if (socket.request.session) {
            if (["closed", "expired"].includes(socket.request.session.status)) {
              return sendError(`session_is_${socket.request.session.status}`);
            }
          }
          // eslint-disable-next-line prefer-const
          let { data, ack } = this.mapPayload(payload);
          // data = this.decrypter(data);

          return transform(callback(data, ack)).pipe(
            catchError(sendError),
            filter((response: any) => !isNil(response)),
            map((response: any) => [response, ack]),
          );
        }),
        takeUntil(disconnect$),
      );

      source$.subscribe(([response, ack]) => {
        if (response instanceof Error) {
          socket.emit("error", response.message);
          return "__ERROR__";
        }

        // response = this.encrypter(socket, response);
        if (response.event) return socket.emit(response.event, response.data);

        isFunction(ack) && ack(response);
      });
    });
  }

  public bindMessageHandlersdd(
    client: Socket,
    handlers: MessageMappingProperties[],
    transform: (data: any) => Observable<any>,
  ) {
    const disconnect$ = fromEvent(client, DISCONNECT_EVENT).pipe(
      share(),
      first(),
    );

    handlers.forEach(({ message, callback }) => {
      const source$ = fromEvent(client, message).pipe(
        mergeMap((payload: any) => {
          const { data, ack } = this.mapPayload(payload);
          return transform(callback(data, ack)).pipe(
            filter((response: any) => !isNil(response)),
            map((response: any) => [response, ack]),
          );
        }),
        takeUntil(disconnect$),
      );
      source$.subscribe(([response, ack]) => {
        if (response.event) {
          return client.emit(response.event, response.data);
        }
        isFunction(ack) && ack(response);
      });
    });
  }

  public mapPayload(payload: any): { data: any; ack?: any } {
    if (!Array.isArray(payload)) {
      return { data: payload };
    }
    const lastElement = payload[payload.length - 1];
    const isAck = isFunction(lastElement);
    if (isAck) {
      const size = payload.length - 1;
      return {
        data: size === 1 ? payload[0] : payload.slice(0, size),
        ack: lastElement,
      };
    }
    return { data: payload };
  }
}
