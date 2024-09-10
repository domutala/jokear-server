import { Global, Module } from "@nestjs/common";
import { CallGateway } from "./gateway";

@Global()
@Module({
  providers: [CallGateway],
})
export class CallModule {}
