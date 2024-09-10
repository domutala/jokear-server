import { DataSource, DataSourceOptions } from "typeorm";
import entitys from "./entitys";

export let dataSource: DataSource;

export const ConfigDatabase = () => {
  const config = {
    type: "postgres",
    username: process.env.DATABASE_USERNAME || "postgres",
    password: process.env.DATABASE_PASSWORD || "secret",
    database: process.env.POSTGRES_DB || "jokear",
    port: process.env.DATABASE_PORT || 5433,
    host: process.env.DATABASE_HOST || "localhost",
    synchronize: true,
    logging: false,
    entities: entitys,
  };

  return config as DataSourceOptions;
};

export const CreateDatabase = async () => {
  try {
    const config = ConfigDatabase();

    dataSource = new DataSource(config);
  } catch (error) {
    throw error;
  }

  await dataSource.initialize();

  return dataSource;
};
