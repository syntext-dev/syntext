import { join } from 'node:path'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'

export type Credentials = {
  token: string
  apiUrl?: string
}

const CREDENTIALS_DIR = join(homedir(), '.syntext')
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.json')

export async function loadCredentials(): Promise<Credentials | null> {
  try {
    const content = await readFile(CREDENTIALS_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}

export async function saveCredentials(credentials: Credentials): Promise<void> {
  await mkdir(CREDENTIALS_DIR, { recursive: true })
  await writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 })
}

export async function clearCredentials(): Promise<void> {
  try {
    const { unlink } = await import('node:fs/promises')
    await unlink(CREDENTIALS_FILE)
  } catch {
    // ignore
  }
}
