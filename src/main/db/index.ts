import { SqliteRepository } from './sqlite'
import { DataRepository } from './interface'

let repository: DataRepository

export async function initDatabase(): Promise<void> {
  const repo = new SqliteRepository()
  await repo.init()
  repository = repo
}

export function getRepository(): DataRepository {
  return repository
}
