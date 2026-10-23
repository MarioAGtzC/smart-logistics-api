import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGraphsAndEdges1792798241738 implements MigrationInterface {
  name = 'CreateGraphsAndEdges1792798241738';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "graphs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nodes" text array NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4f32e4f134362de610c87cb99e7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "edges" ("id" SERIAL NOT NULL, "from_node" text NOT NULL, "to_node" text NOT NULL, "cost" double precision NOT NULL, "max_weight" double precision, "no_hazardous" boolean NOT NULL DEFAULT false, "traffic_multiplier" double precision NOT NULL DEFAULT '1', "graph_id" uuid NOT NULL, CONSTRAINT "PK_46bb3dd9779f5e6d0d2200cc1b0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a51927d9c5cda3c1856179ee85" ON "edges"  ("graph_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "edges" ADD CONSTRAINT "FK_a51927d9c5cda3c1856179ee85d" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "edges" DROP CONSTRAINT "FK_a51927d9c5cda3c1856179ee85d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a51927d9c5cda3c1856179ee85"`,
    );
    await queryRunner.query(`DROP TABLE "edges"`);
    await queryRunner.query(`DROP TABLE "graphs"`);
  }
}
