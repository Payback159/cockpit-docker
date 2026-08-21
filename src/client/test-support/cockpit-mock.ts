/* Test-Double fuer das cockpit-Modul.
 *
 * build-tests.js biegt Importe von 'cockpit' per esbuild-alias hierher um.
 * Die Tests steuern das Verhalten ueber setSpawnHandler().
 */

export interface FakeSpawnCall {
    args: string[];
    superuser?: string | null;
    environ?: string[] | undefined;
}

export class FakeProcessError extends Error {
    problem: string | null;
    exit_status: number | null;

    constructor(message: string, problem: string | null = null, exitStatus: number | null = 1) {
        super(message);
        this.problem = problem;
        this.exit_status = exitStatus;
    }
}

type Handler = (call: FakeSpawnCall) => string | Promise<string>;

let handler: Handler = () => '';
const calls: FakeSpawnCall[] = [];

export function setSpawnHandler(h: Handler): void {
    handler = h;
}

export function recordedCalls(): FakeSpawnCall[] {
    return calls;
}

export function resetMock(): void {
    handler = () => '';
    calls.length = 0;
}

function fakeSpawn(args: string[], options: Record<string, unknown> = {}) {
    const call: FakeSpawnCall = {
        args,
        superuser: (options.superuser as string | undefined) ?? null,
        environ: options.environ as string[] | undefined,
    };
    calls.push(call);

    const promise = Promise.resolve().then(() => handler(call));
    // cockpit.spawn liefert ein Promise mit Zusatzmethoden.
    return Object.assign(promise, {
        stream(cb: (data: string) => void) {
            promise.then(out => cb(out)).catch(() => undefined);
            return promise;
        },
        close() { /* im Test ohne Wirkung */ },
        input() { return promise; },
    });
}

const cockpit = {
    spawn: fakeSpawn,
    format: (fmt: string, ...args: unknown[]) =>
        fmt.replace(/\$(\d+)/g, (_m, i) => String(args[Number(i)] ?? '')),
    gettext: (s: string) => s,
};

export default cockpit;
