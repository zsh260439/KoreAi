import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddWorkspaceMessageRetrievalDebug1760000000000 implements MigrationInterface {
  name = 'AddWorkspaceMessageRetrievalDebug1760000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_message"
        ADD COLUMN IF NOT EXISTS "retrievalDebug" jsonb;
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workspace_message"
        DROP COLUMN IF EXISTS "retrievalDebug";
    `)
  }
}
