declare module 'sql.js' {
    export interface SqlJsDatabase {
        run(sql: string, params?: any[]): SqlJsDatabase
        exec(sql: string, params?: any[]): Array<any>
        prepare(sql: string): any
        export(): Uint8Array
        close(): void
    }

    export interface SqlJsStatic {
        Database: new (data?: Uint8Array | number[]) => SqlJsDatabase
    }

    function initSqlJs(): Promise<SqlJsStatic>
    export default initSqlJs
}
