import { describe, it, expect } from 'bun:test'
import { parseAnnotationBlock } from './parse-annotation'
import { parseTypeScriptSource } from './parse-typescript'
import { parsePythonSource } from './parse-python'
import { parseGoSource } from './parse-go'
import { generatePages } from './generate-mdx'
import { generateSignatureHashes, resolveEmbeds } from './index'

describe('parseAnnotationBlock', () => {
  it('should parse group directive', () => {
    const result = parseAnnotationBlock('@stx group "Authentication"')
    expect(result?.group).toBe('Authentication')
  })

  it('should parse multiple directives', () => {
    const comment = `@stx group "Users"
@stx title "Create User"
@stx description "Creates a new user account"
@stx param name {string} The user's display name
@stx param email {string} The user's email address
@stx returns {User} The created user object
@stx since v2.0`

    const result = parseAnnotationBlock(comment)
    expect(result?.group).toBe('Users')
    expect(result?.title).toBe('Create User')
    expect(result?.description).toBe('Creates a new user account')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0].name).toBe('name')
    expect(result?.params?.[0].type).toBe('string')
    expect(result?.returns?.type).toBe('User')
    expect(result?.since).toBe('v2.0')
  })

  it('should parse deprecated', () => {
    const result = parseAnnotationBlock('@stx group "Legacy"\n@stx deprecated "Use createUserV2 instead"')
    expect(result?.deprecated).toBe('Use createUserV2 instead')
  })

  it('should parse internal', () => {
    const result = parseAnnotationBlock('@stx group "Internal"\n@stx internal')
    expect(result?.internal).toBe(true)
  })

  it('should parse examples', () => {
    const comment = `@stx group "Auth"
@stx example "Basic usage"
const token = await authenticate(email, password)
console.log(token)`

    const result = parseAnnotationBlock(comment)
    expect(result?.examples).toHaveLength(1)
    expect(result?.examples?.[0].title).toBe('Basic usage')
    expect(result?.examples?.[0].code).toContain('authenticate')
  })

  it('should return null for non-stx comments', () => {
    const result = parseAnnotationBlock('Just a regular comment')
    expect(result).toBeNull()
  })

  it('should parse optional params', () => {
    const result = parseAnnotationBlock('@stx group "Test"\n@stx param limit {number} [optional] Max results')
    expect(result?.params?.[0].required).toBe(false)
    expect(result?.params?.[0].description).toBe('Max results')
  })
})

describe('parseTypeScriptSource', () => {
  it('should parse function with JSDoc @stx', () => {
    const source = `/**
 * @stx group "Authentication"
 * @stx param email {string} User email
 * @stx returns {Promise<Token>} JWT token
 */
export async function authenticate(email: string, password: string): Promise<Token> {
  // ...
}`

    const symbols = parseTypeScriptSource(source, 'auth.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('authenticate')
    expect(symbols[0].kind).toBe('function')
    expect(symbols[0].annotation.group).toBe('Authentication')
    expect(symbols[0].signature.params).toHaveLength(2)
    expect(symbols[0].signature.params[0].name).toBe('email')
    expect(symbols[0].signature.params[0].type).toBe('string')
    expect(symbols[0].signature.returnType).toBe('Promise<Token>')
  })

  it('should parse triple-slash annotations', () => {
    const source = `/// @stx group "Users"
/// @stx title "Get User"
export function getUser(id: string): User {
  return db.users.get(id)
}`

    const symbols = parseTypeScriptSource(source, 'users.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.title).toBe('Get User')
  })

  it('should parse class definitions', () => {
    const source = `/**
 * @stx group "Core"
 * @stx description "Main application class"
 */
export class Application {
  constructor() {}
}`

    const symbols = parseTypeScriptSource(source, 'app.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].name).toBe('Application')
  })

  it('should parse interface definitions', () => {
    const source = `/**
 * @stx group "Types"
 */
export interface UserConfig {
  name: string
}`

    const symbols = parseTypeScriptSource(source, 'types.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('interface')
  })

  it('should parse arrow functions', () => {
    const source = `/**
 * @stx group "Utils"
 */
export const formatDate = (date: Date, format?: string): string => {
  return date.toISOString()
}`

    const symbols = parseTypeScriptSource(source, 'utils.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('formatDate')
    expect(symbols[0].signature.params[1]?.optional).toBe(true)
  })

  it('should parse optional and default params', () => {
    const source = `/// @stx group "API"
export function query(table: string, limit: number = 100, offset?: number): Result[] {
  return []
}`

    const symbols = parseTypeScriptSource(source, 'api.ts')
    expect(symbols[0].signature.params[1].optional).toBe(true)
    expect(symbols[0].signature.params[1].defaultValue).toBe('100')
    expect(symbols[0].signature.params[2].optional).toBe(true)
  })
})

describe('parsePythonSource', () => {
  it('should parse function with comment annotations', () => {
    const source = `# @stx group "Authentication"
# @stx param email {str} User email
# @stx returns {Token} JWT token
async def authenticate(email: str, password: str) -> Token:
    pass`

    const symbols = parsePythonSource(source, 'auth.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('authenticate')
    expect(symbols[0].annotation.group).toBe('Authentication')
    expect(symbols[0].signature.returnType).toBe('Token')
  })

  it('should parse function with docstring annotations', () => {
    const source = `def create_user(name: str, email: str) -> User:
    """
    @stx group "Users"
    @stx description "Creates a new user in the database"
    """
    pass`

    const symbols = parsePythonSource(source, 'users.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('create_user')
    expect(symbols[0].annotation.description).toBe('Creates a new user in the database')
  })

  it('should parse class definitions', () => {
    const source = `# @stx group "Models"
class UserModel:
    pass`

    const symbols = parsePythonSource(source, 'models.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].name).toBe('UserModel')
  })

  it('should filter self from params', () => {
    const source = `# @stx group "API"
def get_data(self, key: str) -> dict:
    pass`

    const symbols = parsePythonSource(source, 'api.py')
    expect(symbols[0].signature.params).toHaveLength(1)
    expect(symbols[0].signature.params[0].name).toBe('key')
  })
})

describe('parseGoSource', () => {
  it('should parse function with // @stx comments', () => {
    const source = `// @stx group "Authentication"
// @stx param token {string} Bearer token
// @stx returns {*User, error} Authenticated user
func Authenticate(token string) (*User, error) {
    return nil, nil
}`

    const symbols = parseGoSource(source, 'auth.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('Authenticate')
    expect(symbols[0].kind).toBe('function')
    expect(symbols[0].annotation.group).toBe('Authentication')
  })

  it('should parse struct definitions', () => {
    const source = `// @stx group "Models"
// @stx description "Represents a user account"
type User struct {
    ID   string
    Name string
}`

    const symbols = parseGoSource(source, 'models.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].name).toBe('User')
  })

  it('should parse interface definitions', () => {
    const source = `// @stx group "Interfaces"
type Repository interface {
    Get(id string) (*Entity, error)
}`

    const symbols = parseGoSource(source, 'repo.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('interface')
  })

  it('should parse methods with receivers', () => {
    const source = `// @stx group "User"
func (u *User) FullName() string {
    return u.FirstName + " " + u.LastName
}`

    const symbols = parseGoSource(source, 'user.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].kind).toBe('method')
    expect(symbols[0].name).toBe('FullName')
  })
})

describe('generatePages', () => {
  it('should group symbols by annotation group', () => {
    const source = `/// @stx group "Users"
export function createUser(name: string): User { return {} as User }

/// @stx group "Users"
export function deleteUser(id: string): void {}

/// @stx group "Auth"
export function login(email: string): Token { return {} as Token }`

    const symbols = parseTypeScriptSource(source, 'api.ts')
    const pages = generatePages(symbols)

    expect(pages).toHaveLength(2)
    const usersPage = pages.find((p) => p.group === 'Users')
    expect(usersPage?.symbols).toHaveLength(2)
    expect(usersPage?.slug).toBe('api/users')
  })

  it('should filter internal symbols', () => {
    const source = `/// @stx group "Internal"
/// @stx internal
export function _helper(): void {}

/// @stx group "Public"
export function publicFn(): void {}`

    const symbols = parseTypeScriptSource(source, 'api.ts')
    const pages = generatePages(symbols)

    expect(pages).toHaveLength(1)
    expect(pages[0].group).toBe('Public')
  })

  it('should generate valid MDX frontmatter', () => {
    const source = `/// @stx group "SDK"
export function init(config: Config): void {}`

    const symbols = parseTypeScriptSource(source, 'sdk.ts')
    const pages = generatePages(symbols)

    expect(pages[0].content).toContain('---')
    expect(pages[0].content).toContain('title: "SDK"')
  })
})

describe('generateSignatureHashes', () => {
  it('should produce consistent hashes', () => {
    const source = `/// @stx group "API"
export function getData(id: string): Data { return {} as Data }`

    const symbols = parseTypeScriptSource(source, 'api.ts')
    const hashes1 = generateSignatureHashes(symbols)
    const hashes2 = generateSignatureHashes(symbols)

    expect(hashes1[0].hash).toBe(hashes2[0].hash)
  })

  it('should change hash when signature changes', () => {
    const source1 = `/// @stx group "API"
export function getData(id: string): Data { return {} as Data }`

    const source2 = `/// @stx group "API"
export function getData(id: string, force: boolean): Data { return {} as Data }`

    const symbols1 = parseTypeScriptSource(source1, 'api.ts')
    const symbols2 = parseTypeScriptSource(source2, 'api.ts')

    const hash1 = generateSignatureHashes(symbols1)[0].hash
    const hash2 = generateSignatureHashes(symbols2)[0].hash

    expect(hash1).not.toBe(hash2)
  })
})

describe('resolveEmbeds', () => {
  it('should replace {@embed} with symbol content', () => {
    const source = `/// @stx group "API"
/// @stx description "Fetches user data"
export function getUser(id: string): User { return {} as User }`

    const symbols = parseTypeScriptSource(source, 'api.ts')
    const mdx = 'Some content\n\n{@embed getUser}\n\nMore content'
    const resolved = resolveEmbeds(mdx, symbols)

    expect(resolved).toContain('Fetches user data')
    expect(resolved).not.toContain('{@embed')
  })

  it('should leave comment for missing symbol', () => {
    const resolved = resolveEmbeds('{@embed nonExistent}', [])
    expect(resolved).toContain('not found')
  })
})
