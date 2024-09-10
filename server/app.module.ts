import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
// import { TypeOrmModule } from "@nestjs/typeorm";
// import { ConfigDatabase } from "database";
import { CallModule } from "endpoints/call/module";

@Module({
  imports: [
    ConfigModule.forRoot(),
    // TypeOrmModule.forRoot({ ...ConfigDatabase(), autoLoadEntities: true }),

    CallModule,
  ],

  controllers: [],
  exports: [],
})
export class AppModule {}
