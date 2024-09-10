import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { SocketIoAdapter } from "utils/socket-io.adapter";
import { Logger } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT || 8450;

  app.enableCors();
  app.useWebSocketAdapter(new SocketIoAdapter(app));

  await app.listen(port);

  Logger.log(`listen at http://localhost:${port}`, await app.getUrl());
}

bootstrap();
