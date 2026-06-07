import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { WorkspaceMessageEntity } from './workspace-message.entity'

@Entity('workspace_conversation')
export class WorkspaceConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', length: 200 })
  title!: string

  @Column({ type: 'varchar', length: 100, nullable: true })
  model!: string | null

  @Column({ type: 'int', default: 0 })
  messageCount!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date

  @OneToMany(() => WorkspaceMessageEntity, (message) => message.conversation)
  messages!: WorkspaceMessageEntity[]
}
