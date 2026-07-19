import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddDetectedSourceHash1760000008000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document"
        ADD COLUMN "detectedSourceHash" varchar(64)
    `)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "knowledge_document" DROP COLUMN "detectedSourceHash"
    `)
  }
}
