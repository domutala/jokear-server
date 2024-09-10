import { Session } from "database/entitys/Session";
import { User } from "database/entitys/User";
import { Server, Socket } from "socket.io";
import { IncomingMessage } from "http";

type Newable<T> = new (...args: any[]) => T;

export declare global {
  namespace Express {
    interface Request {
      module: { name: string; function: (params: any) => any };
      session: Session;
    }
  }
}

declare module "http" {
  interface IncomingMessage {
    session: Session;
  }
}
