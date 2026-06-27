import { describe, it, expect } from 'bun:test'
import { parseConventionalComment, parsePythonDocstring, parseGoDocComment, parseRustDocComment, parseCSharpXmlDoc } from './parse-conventional'
import { parseTypeScriptSource } from './parse-typescript'
import { parsePythonSource } from './parse-python'
import { parseGoSource } from './parse-go'
import { parseRustSource } from './parse-rust'
import { parseJavaSource } from './parse-java'
import { parsePhpSource } from './parse-php'
import { parseCSharpSource } from './parse-csharp'

// ─── JSDoc / Conventional Comment Parser ─────────────────────────────────────

describe('parseConventionalComment', () => {
  it('should parse a basic JSDoc comment with description', () => {
    const result = parseConventionalComment('Fetches user data from the API')
    expect(result?.description).toBe('Fetches user data from the API')
    expect(result?.group).toBe('Default')
  })

  it('should parse @param {type} name - description', () => {
    const comment = `Fetches a user by ID.
@param {string} id - The user ID
@param {boolean} includeProfile - Whether to include profile data
@returns {Promise<User>} The user object`

    const result = parseConventionalComment(comment)
    expect(result?.description).toBe('Fetches a user by ID.')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'id', type: 'string', description: 'The user ID', required: true })
    expect(result?.params?.[1]).toEqual({ name: 'includeProfile', type: 'boolean', description: 'Whether to include profile data', required: true })
    expect(result?.returns).toEqual({ type: 'Promise<User>', description: 'The user object' })
  })

  it('should parse optional params with [name]', () => {
    const comment = `@param {string} [name] - Optional name`
    const result = parseConventionalComment(comment)
    expect(result?.params?.[0]?.required).toBe(false)
  })

  it('should parse @deprecated', () => {
    const comment = `Old function.
@deprecated Use newFunction instead`
    const result = parseConventionalComment(comment)
    expect(result?.deprecated).toBe('Use newFunction instead')
  })

  it('should parse @since', () => {
    const comment = `New feature.
@since v2.1.0`
    const result = parseConventionalComment(comment)
    expect(result?.since).toBe('v2.1.0')
  })

  it('should parse @see references', () => {
    const comment = `Does stuff.
@see OtherFunction
@see https://example.com`
    const result = parseConventionalComment(comment)
    expect(result?.see).toEqual(['OtherFunction', 'https://example.com'])
  })

  it('should parse @example blocks', () => {
    const comment = `Creates a client.
@example Basic usage
const client = createClient({ url: 'http://localhost' })
client.connect()`
    const result = parseConventionalComment(comment)
    expect(result?.examples).toHaveLength(1)
    expect(result?.examples?.[0]?.title).toBe('Basic usage')
    expect(result?.examples?.[0]?.code).toContain('createClient')
  })

  it('should parse @internal/@private', () => {
    const comment = `Internal helper.
@internal`
    const result = parseConventionalComment(comment)
    expect(result?.internal).toBe(true)
  })

  it('should parse @category as group', () => {
    const comment = `Auth function.
@category Authentication`
    const result = parseConventionalComment(comment)
    expect(result?.group).toBe('Authentication')
  })

  it('should return null for empty comments', () => {
    expect(parseConventionalComment('')).toBeNull()
    expect(parseConventionalComment('   ')).toBeNull()
  })

  it('should parse @param without type', () => {
    const comment = `@param name - The user name
@param age - The user age`
    const result = parseConventionalComment(comment)
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'name', type: 'any', description: 'The user name', required: true })
  })

  it('should parse @returns without type', () => {
    const comment = `@returns The processed data`
    const result = parseConventionalComment(comment)
    expect(result?.returns).toEqual({ type: 'unknown', description: 'The processed data' })
  })
})

// ─── Python Docstring Parser ─────────────────────────────────────────────────

describe('parsePythonDocstring', () => {
  it('should parse a simple docstring', () => {
    const result = parsePythonDocstring('Fetches user data from the database.')
    expect(result?.description).toBe('Fetches user data from the database.')
  })

  it('should parse Google-style docstring', () => {
    const docstring = `Fetches user by ID.

Args:
    user_id (str): The unique user identifier
    include_deleted (bool): Whether to include soft-deleted users

Returns:
    User: The found user object`

    const result = parsePythonDocstring(docstring)
    expect(result?.description).toBe('Fetches user by ID.')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'user_id', type: 'str', description: 'The unique user identifier', required: true })
    expect(result?.params?.[1]).toEqual({ name: 'include_deleted', type: 'bool', description: 'Whether to include soft-deleted users', required: true })
    expect(result?.returns?.type).toBe('User')
    expect(result?.returns?.description).toBe('The found user object')
  })

  it('should parse NumPy-style docstring', () => {
    const docstring = `Process data array.

Parameters
----------
data : array_like
    Input data to process
threshold : float
    Minimum value threshold

Returns
-------
ndarray
    Processed data array`

    const result = parsePythonDocstring(docstring)
    expect(result?.description).toBe('Process data array.')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]?.name).toBe('data')
    expect(result?.returns?.type).toBe('ndarray')
  })

  it('should parse reST/Sphinx-style docstring', () => {
    const docstring = `Send a message to the server.

:param host: The server hostname
:type host: str
:param port: The server port
:returns: True if sent successfully
:rtype: bool`

    const result = parsePythonDocstring(docstring)
    expect(result?.description).toBe('Send a message to the server.')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'host', type: 'str', description: 'The server hostname', required: true })
    expect(result?.params?.[1]).toEqual({ name: 'port', type: 'any', description: 'The server port', required: true })
    expect(result?.returns?.type).toBe('bool')
    expect(result?.returns?.description).toBe('True if sent successfully')
  })

  it('should parse Examples section', () => {
    const docstring = `Add two numbers.

Examples:
    >>> add(1, 2)
    3
    >>> add(-1, 1)
    0`

    const result = parsePythonDocstring(docstring)
    expect(result?.examples).toHaveLength(1)
    expect(result?.examples?.[0]?.code).toContain('add(1, 2)')
  })

  it('should handle optional params in Google style', () => {
    const docstring = `Create config.

Args:
    name (str): Required name
    timeout (int, optional): Connection timeout`

    const result = parsePythonDocstring(docstring)
    expect(result?.params?.[0]?.required).toBe(true)
    expect(result?.params?.[1]?.required).toBe(false)
  })
})

// ─── Go Doc Comment Parser ───────────────────────────────────────────────────

describe('parseGoDocComment', () => {
  it('should parse a simple Go doc comment', () => {
    const result = parseGoDocComment('NewClient creates a new API client with the given options.', 'NewClient')
    expect(result?.description).toBe('NewClient creates a new API client with the given options.')
  })

  it('should detect Deprecated prefix', () => {
    const result = parseGoDocComment('Deprecated: Use NewClientV2 instead.', 'OldClient')
    expect(result?.deprecated).toBe('Use NewClientV2 instead.')
  })

  it('should handle multi-line descriptions', () => {
    const comment = `FetchUser retrieves a user from the database.
It returns an error if the user is not found.
The returned user includes all profile fields.`
    const result = parseGoDocComment(comment, 'FetchUser')
    expect(result?.description).toContain('FetchUser retrieves a user')
    expect(result?.description).toContain('It returns an error')
  })

  it('should return null for empty comments', () => {
    expect(parseGoDocComment('', 'Foo')).toBeNull()
  })
})

// ─── Rust Doc Comment Parser ─────────────────────────────────────────────────

describe('parseRustDocComment', () => {
  it('should parse basic Rust doc comment', () => {
    const comment = `/// Creates a new instance of the client.
/// Returns a configured client ready to use.`
    const result = parseRustDocComment(comment)
    expect(result?.description).toContain('Creates a new instance of the client.')
  })

  it('should parse # Arguments section', () => {
    const comment = `/// Connects to the server.
///
/// # Arguments
///
/// * \`host\` - The server hostname
/// * \`port\` - The server port number`

    const result = parseRustDocComment(comment)
    expect(result?.description).toBe('Connects to the server.')
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'host', type: 'unknown', description: 'The server hostname', required: true })
    expect(result?.params?.[1]).toEqual({ name: 'port', type: 'unknown', description: 'The server port number', required: true })
  })

  it('should parse # Returns section', () => {
    const comment = `/// Gets user count.
///
/// # Returns
///
/// The total number of active users.`

    const result = parseRustDocComment(comment)
    expect(result?.returns?.description).toBe('The total number of active users.')
  })

  it('should parse code examples', () => {
    const comment = `/// Creates a buffer.
///
/// # Examples
///
/// \`\`\`rust
/// let buf = Buffer::new(1024);
/// assert_eq!(buf.len(), 0);
/// \`\`\``

    const result = parseRustDocComment(comment)
    expect(result?.examples).toHaveLength(1)
    expect(result?.examples?.[0]?.language).toBe('rust')
    expect(result?.examples?.[0]?.code).toContain('Buffer::new(1024)')
  })
})

// ─── C# XML Doc Comment Parser ───────────────────────────────────────────────

describe('parseCSharpXmlDoc', () => {
  it('should parse <summary>', () => {
    const comment = `<summary>
Gets the user by their unique identifier.
</summary>`
    const result = parseCSharpXmlDoc(comment)
    expect(result?.description).toBe('Gets the user by their unique identifier.')
  })

  it('should parse <param> tags', () => {
    const comment = `<summary>Creates a new user.</summary>
<param name="username">The desired username</param>
<param name="email">The user's email address</param>`

    const result = parseCSharpXmlDoc(comment)
    expect(result?.params).toHaveLength(2)
    expect(result?.params?.[0]).toEqual({ name: 'username', type: 'unknown', description: 'The desired username', required: true })
    expect(result?.params?.[1]).toEqual({ name: 'email', type: 'unknown', description: "The user's email address", required: true })
  })

  it('should parse <returns>', () => {
    const comment = `<summary>Gets count.</summary>
<returns>The total number of items.</returns>`

    const result = parseCSharpXmlDoc(comment)
    expect(result?.returns).toEqual({ type: 'unknown', description: 'The total number of items.' })
  })

  it('should parse <example> with <code>', () => {
    const comment = `<summary>Adds numbers.</summary>
<example>
<code>
var result = Add(1, 2);
Console.WriteLine(result); // 3
</code>
</example>`

    const result = parseCSharpXmlDoc(comment)
    expect(result?.examples).toHaveLength(1)
    expect(result?.examples?.[0]?.language).toBe('csharp')
    expect(result?.examples?.[0]?.code).toContain('Add(1, 2)')
  })

  it('should parse <see cref="..."/> as cross-references', () => {
    const comment = `<summary>Gets user. See <see cref="UpdateUser"/> for updating.</summary>
<seealso cref="DeleteUser"/>`

    const result = parseCSharpXmlDoc(comment)
    expect(result?.see).toContain('UpdateUser')
    expect(result?.see).toContain('DeleteUser')
    expect(result?.description).toContain('`UpdateUser`')
  })

  it('should parse <remarks>', () => {
    const comment = `<summary>Short description.</summary>
<remarks>Extended details about usage and behavior.</remarks>`

    const result = parseCSharpXmlDoc(comment)
    expect(result?.description).toContain('Short description.')
    expect(result?.description).toContain('Extended details about usage and behavior.')
  })
})

// ─── TypeScript Integration (end-to-end) ─────────────────────────────────────

describe('TypeScript conventional comment parsing', () => {
  it('should parse JSDoc comments without @stx', () => {
    const source = `/**
 * Creates a new user account.
 * @param {string} name - The user display name
 * @param {string} email - The user email
 * @returns {Promise<User>} The created user
 */
export async function createUser(name: string, email: string): Promise<User> {
  return db.users.create({ name, email })
}`

    const symbols = parseTypeScriptSource(source, 'test.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('createUser')
    expect(symbols[0].annotation.description).toBe('Creates a new user account.')
    expect(symbols[0].annotation.params).toHaveLength(2)
    expect(symbols[0].annotation.params?.[0]?.name).toBe('name')
    expect(symbols[0].annotation.returns?.type).toBe('Promise<User>')
  })

  it('should still prioritize @stx over JSDoc', () => {
    const source = `/**
 * @stx group "Users"
 * @stx title "Create User"
 * @stx param name {string} Display name
 */
export function createUser(name: string): User {
  return { name }
}`

    const symbols = parseTypeScriptSource(source, 'test.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.group).toBe('Users')
    expect(symbols[0].annotation.title).toBe('Create User')
  })

  it('should parse multiple functions with JSDoc', () => {
    const source = `/**
 * Gets a user by ID.
 * @param {string} id - The user ID
 * @returns {User | null} The user or null
 */
export function getUser(id: string): User | null {
  return db.find(id)
}

/**
 * Deletes a user.
 * @param {string} id - The user ID to delete
 * @deprecated Use archiveUser instead
 */
export function deleteUser(id: string): void {
  db.delete(id)
}`

    const symbols = parseTypeScriptSource(source, 'test.ts')
    expect(symbols).toHaveLength(2)
    expect(symbols[0].name).toBe('getUser')
    expect(symbols[1].name).toBe('deleteUser')
    expect(symbols[1].annotation.deprecated).toBe('Use archiveUser instead')
  })

  it('should parse class JSDoc', () => {
    const source = `/**
 * Represents an HTTP client for making API calls.
 * @category Networking
 */
export class HttpClient {
  constructor() {}
}`

    const symbols = parseTypeScriptSource(source, 'test.ts')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('HttpClient')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.group).toBe('Networking')
  })

  it('should ignore non-doc comments', () => {
    const source = `// This is just a regular comment
export function foo() {}

/* Not a doc comment */
export function bar() {}`

    const symbols = parseTypeScriptSource(source, 'test.ts')
    expect(symbols).toHaveLength(0)
  })
})

// ─── Python Integration (end-to-end) ─────────────────────────────────────────

describe('Python conventional docstring parsing', () => {
  it('should parse Google-style docstrings without @stx', () => {
    const source = `def fetch_user(user_id: str, include_profile: bool = False) -> User:
    """Fetches a user from the database.

    Args:
        user_id (str): The unique user identifier
        include_profile (bool): Whether to include profile data

    Returns:
        User: The found user object
    """
    pass`

    const symbols = parsePythonSource(source, 'test.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('fetch_user')
    expect(symbols[0].annotation.description).toBe('Fetches a user from the database.')
    expect(symbols[0].annotation.params).toHaveLength(2)
    expect(symbols[0].annotation.params?.[0]?.name).toBe('user_id')
    expect(symbols[0].annotation.returns?.type).toBe('User')
  })

  it('should parse reST-style docstrings', () => {
    const source = `def send_message(host: str, port: int) -> bool:
    """Send a message to the server.

    :param host: The server hostname
    :type host: str
    :param port: The server port
    :returns: True if sent successfully
    :rtype: bool
    """
    pass`

    const symbols = parsePythonSource(source, 'test.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.params?.[0]?.type).toBe('str')
    expect(symbols[0].annotation.returns?.type).toBe('bool')
  })

  it('should still prioritize @stx in docstrings', () => {
    const source = `def my_func():
    """
    @stx group "Utilities"
    @stx title "My Function"
    """
    pass`

    const symbols = parsePythonSource(source, 'test.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.group).toBe('Utilities')
  })

  it('should parse class docstrings', () => {
    const source = `class UserService:
    """Manages user lifecycle operations.

    Handles creation, updating, and deletion of user accounts.
    """
    pass`

    const symbols = parsePythonSource(source, 'test.py')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('UserService')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.description).toContain('Manages user lifecycle')
  })
})

// ─── Go Integration (end-to-end) ─────────────────────────────────────────────

describe('Go conventional doc comment parsing', () => {
  it('should parse Go doc comments without @stx', () => {
    const source = `// NewClient creates a new API client with the given configuration.
// It validates the config and returns an error if invalid.
func NewClient(config Config) (*Client, error) {`

    const symbols = parseGoSource(source, 'test.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('NewClient')
    expect(symbols[0].annotation.description).toContain('creates a new API client')
  })

  it('should detect Deprecated in Go doc comments', () => {
    const source = `// Deprecated: Use NewClientV2 instead.
func OldClient() *Client {`

    const symbols = parseGoSource(source, 'test.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.deprecated).toBeTruthy()
  })

  it('should parse struct doc comments', () => {
    const source = `// Config holds the configuration for the API client.
// It includes connection settings and authentication options.
type Config struct {`

    const symbols = parseGoSource(source, 'test.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('Config')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.description).toContain('holds the configuration')
  })

  it('should parse interface doc comments', () => {
    const source = `// Store provides methods for persisting data.
type Store interface {`

    const symbols = parseGoSource(source, 'test.go')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('Store')
    expect(symbols[0].kind).toBe('interface')
  })
})

// ─── Rust Integration (end-to-end) ───────────────────────────────────────────

describe('Rust conventional doc comment parsing', () => {
  it('should parse Rust /// doc comments without @stx', () => {
    const source = `/// Creates a new buffer with the specified capacity.
///
/// # Arguments
///
/// * \`capacity\` - The initial buffer capacity in bytes
///
/// # Returns
///
/// A new empty buffer.
pub fn new(capacity: usize) -> Buffer {`

    const symbols = parseRustSource(source, 'test.rs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('new')
    expect(symbols[0].annotation.description).toContain('Creates a new buffer')
    expect(symbols[0].annotation.params).toHaveLength(1)
    expect(symbols[0].annotation.params?.[0]?.name).toBe('capacity')
    expect(symbols[0].annotation.returns?.description).toBe('A new empty buffer.')
  })

  it('should parse struct doc comments', () => {
    const source = `/// A thread-safe connection pool.
///
/// Manages database connections with automatic reconnection.
pub struct ConnectionPool {`

    const symbols = parseRustSource(source, 'test.rs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('ConnectionPool')
    expect(symbols[0].kind).toBe('class')
  })

  it('should parse examples from doc comments', () => {
    const source = `/// Adds two numbers.
///
/// # Examples
///
/// \`\`\`rust
/// let result = add(2, 3);
/// assert_eq!(result, 5);
/// \`\`\`
pub fn add(a: i32, b: i32) -> i32 {`

    const symbols = parseRustSource(source, 'test.rs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.examples).toHaveLength(1)
    expect(symbols[0].annotation.examples?.[0]?.code).toContain('add(2, 3)')
  })
})

// ─── Java Integration (end-to-end) ───────────────────────────────────────────

describe('Java conventional Javadoc parsing', () => {
  it('should parse Javadoc comments without @stx', () => {
    const source = `/**
 * Creates a new user in the system.
 *
 * @param username the desired username
 * @param email the user email address
 * @return the created User object
 * @since 2.0
 */
public User createUser(String username, String email) {`

    const symbols = parseJavaSource(source, 'Test.java')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('createUser')
    expect(symbols[0].annotation.description).toBe('Creates a new user in the system.')
    expect(symbols[0].annotation.params).toHaveLength(2)
    expect(symbols[0].annotation.params?.[0]?.name).toBe('username')
    expect(symbols[0].annotation.since).toBe('2.0')
  })

  it('should parse class Javadoc', () => {
    const source = `/**
 * Service for managing authentication tokens.
 *
 * @deprecated Use TokenServiceV2 instead
 */
public class TokenService {`

    const symbols = parseJavaSource(source, 'Test.java')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('TokenService')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.deprecated).toBe('Use TokenServiceV2 instead')
  })

  it('should skip Java annotations (@Override) and find the definition', () => {
    const source = `/**
 * Returns the string representation.
 * @return formatted string
 */
@Override
public String toString() {`

    const symbols = parseJavaSource(source, 'Test.java')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('toString')
  })
})

// ─── PHP Integration (end-to-end) ────────────────────────────────────────────

describe('PHP conventional DocBlock parsing', () => {
  it('should parse PHPDoc comments without @stx', () => {
    const source = `/**
 * Sends an email notification to the user.
 *
 * @param string $to The recipient email address
 * @param string $subject The email subject line
 * @return bool Whether the email was sent successfully
 */
function sendEmail(string $to, string $subject): bool {`

    const symbols = parsePhpSource(source, 'test.php')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('sendEmail')
    expect(symbols[0].annotation.description).toBe('Sends an email notification to the user.')
    expect(symbols[0].annotation.params).toHaveLength(2)
  })

  it('should parse class DocBlock', () => {
    const source = `/**
 * Manages database connections and query execution.
 *
 * @category Database
 */
class DatabaseManager {`

    const symbols = parsePhpSource(source, 'test.php')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('DatabaseManager')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.group).toBe('Database')
  })
})

// ─── C# Integration (end-to-end) ────────────────────────────────────────────

describe('C# conventional XML doc comment parsing', () => {
  it('should parse XML doc comments without @stx', () => {
    const source = `/// <summary>
/// Creates a new user account in the system.
/// </summary>
/// <param name="username">The desired username</param>
/// <param name="email">The user's email address</param>
/// <returns>The created user object</returns>
public async Task<User> CreateUser(string username, string email) {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('CreateUser')
    expect(symbols[0].annotation.description).toBe('Creates a new user account in the system.')
    expect(symbols[0].annotation.params).toHaveLength(2)
    expect(symbols[0].annotation.params?.[0]?.name).toBe('username')
    expect(symbols[0].annotation.returns?.description).toBe('The created user object')
  })

  it('should parse class with XML doc', () => {
    const source = `/// <summary>
/// Manages user authentication and sessions.
/// </summary>
/// <remarks>
/// This service handles OAuth, JWT, and API key authentication.
/// </remarks>
public class AuthService {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('AuthService')
    expect(symbols[0].kind).toBe('class')
    expect(symbols[0].annotation.description).toContain('Manages user authentication')
    expect(symbols[0].annotation.description).toContain('This service handles OAuth')
  })

  it('should skip C# attributes and find definition', () => {
    const source = `/// <summary>Gets user by ID.</summary>
/// <param name="id">The user ID</param>
[HttpGet("{id}")]
[Authorize]
public async Task<User> GetUser(string id) {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('GetUser')
  })

  it('should parse interface', () => {
    const source = `/// <summary>
/// Defines data access operations for users.
/// </summary>
public interface IUserRepository {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('IUserRepository')
    expect(symbols[0].kind).toBe('interface')
  })

  it('should parse enum', () => {
    const source = `/// <summary>
/// Represents the possible user roles.
/// </summary>
public enum UserRole {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].name).toBe('UserRole')
    expect(symbols[0].kind).toBe('enum')
  })

  it('should parse see cref as cross-references', () => {
    const source = `/// <summary>
/// Updates user. See <see cref="CreateUser"/> for creation.
/// </summary>
/// <seealso cref="DeleteUser"/>
public void UpdateUser(User user) {`

    const symbols = parseCSharpSource(source, 'Test.cs')
    expect(symbols).toHaveLength(1)
    expect(symbols[0].annotation.see).toContain('CreateUser')
    expect(symbols[0].annotation.see).toContain('DeleteUser')
  })
})
