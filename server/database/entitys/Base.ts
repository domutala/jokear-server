import {
  BaseEntity,
  PrimaryColumn,
  BeforeInsert,
  BeforeUpdate,
  Column,
} from "typeorm";
import { v4 as uuidv4 } from "uuid";
import { validate } from "class-validator";

export class Base extends BaseEntity {
  generateId() {
    this.id = uuidv4();
    return this.id;
  }

  @PrimaryColumn({ type: "uuid", nullable: false })
  id!: string;

  @Column({ type: "timestamp" })
  createdAt: Date;

  @Column({ type: "timestamp" })
  updatedAt: Date;

  @BeforeInsert()
  onInsert() {
    if (!this.id) this.id = uuidv4();

    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  @BeforeInsert()
  @BeforeUpdate()
  async onSave() {
    this.updatedAt = new Date();

    const errors = await validate(this);
    if (errors.length) {
      throw errors
        .map((error) => Object.values(error.constraints).join(";"))
        .join(";");
    }
  }
}
