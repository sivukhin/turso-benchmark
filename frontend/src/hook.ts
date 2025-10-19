import { useEffect, useState } from "react";
import { Database as RemoteDatabase } from "@tursodatabase/sync-wasm/vite";
import { Database as LocalDatabase } from "@tursodatabase/database-wasm/vite";

export interface Result<T> {
    value: T,
    error: any,
    updating: boolean,
}

export interface Db {
    db(): LocalDatabase;
    useStatus(): { online: boolean },
    useAll(query: string, args: any[]): Result<any[]>;
    useOne(query: string, args: any[]): Result<any>;
    update(query: string, args: any[]): Promise<void>;
}

export interface DbOpts {
    errorIntervalMs: number
    pullIntervalMs: number,
    pushIntervalMs: number
}

interface Subscriber {
    subscribe(fn: () => Promise<void>): () => void;
    trigger(): Promise<void>;
}

function subscriber(): Subscriber {
    let updates: { fn: () => Promise<void>, active: boolean }[] = [];
    return {
        subscribe(fn: () => Promise<void>) {
            let entry = { fn: fn, active: true };
            updates.push(entry);
            return () => {
                entry.active = false;
                updates.splice(updates.findIndex(x => x === entry), 1);
            };
        },
        async trigger() {
            let local = [...updates];
            for (let update of local) {
                if (update.active) { await update.fn(); }
            }
        }
    }
}

function useAll(db: LocalDatabase | RemoteDatabase, dbUpdates: Subscriber, query: string, args: any[]) {
    const [updating, setUpdating] = useState(false);
    const [rows, setRows] = useState<any[]>([]);
    const [error, setError] = useState<Error | null>(null);

    const update = async () => {
        setUpdating(true);
        try {
            let rows = await db.prepare(query).all(args);
            setRows(rows);
        } catch (e) {
            setError(e as Error);
        } finally {
            setUpdating(false);
        }
    };
    useEffect(() => {
        update();
        return dbUpdates.subscribe(update);
    }, [db]);

    return {
        value: rows,
        error,
        updating,
    }
}

function useOne(db: LocalDatabase | RemoteDatabase, dbUpdates: Subscriber, query: string, args: any[]) {
    const [updating, setUpdating] = useState(true);
    const [row, setRow] = useState<any>(null);
    const [error, setError] = useState<Error | null>(null);

    const update = async () => {
        setUpdating(true);
        try {
            let row = await db.prepare(query).get(args);
            setRow(row);
        } catch (e) {
            setError(e as Error);
        } finally {
            setUpdating(false);
        }
    };
    useEffect(() => {
        update();
        return dbUpdates.subscribe(update);
    }, [db, query, ...args]);

    return {
        value: row,
        error,
        updating,
    }
}

export function local(db: LocalDatabase): Db {
    let dbUpdates = subscriber();
    return {
        db() {
            return db;
        },
        useStatus() {
            return { online: false };
        },
        useAll(query, args) {
            return useAll(db, dbUpdates, query, args);
        },
        useOne(query, args) {
            return useOne(db, dbUpdates, query, args);
        },
        async update(query, args) {
            await db.prepare(query).run(args);
            await dbUpdates.trigger();
        }
    }
}

export function remote(db: RemoteDatabase, opts: DbOpts): Db {
    let online = true;
    let dbUpdates = subscriber();
    let onlineUpdates = subscriber();

    let push = async () => {
        let error = null;
        try {
            if ((await db.stats()).operations > 0) {
                await db.push();
                if (online != true) {
                    online = true;
                    onlineUpdates.trigger();
                }
            }
        } catch (e) {
            error = e;
        } finally {
            if (error != null) {
                if (online != false) {
                    online = false;
                    onlineUpdates.trigger();
                }
                setTimeout(push, opts.errorIntervalMs);
            } else {
                setTimeout(push, opts.pushIntervalMs);
            }
        }
    }

    let pull = async () => {
        let error = null;
        try {
            if (await db.pull()) {
                await dbUpdates.trigger();
            }
            if (online != true) {
                online = true;
                onlineUpdates.trigger();
            }
        } catch (e) {
            error = e;
        } finally {
            if (error != null) {
                if (online != false) {
                    online = false;
                    onlineUpdates.trigger();
                }
                setTimeout(pull, opts.errorIntervalMs);
            } else {
                setTimeout(pull, opts.pullIntervalMs);
            }
        }
    }

    pull();
    push();

    return {
        db() {
            return db as unknown as LocalDatabase;
        },
        useStatus() {
            const [value, setValue] = useState(online);
            useEffect(() => onlineUpdates.subscribe(async () => setValue(online)));
            return { online: value };
        },
        useAll(query, args) {
            return useAll(db, dbUpdates, query, args);
        },
        useOne(query, args) {
            return useOne(db, dbUpdates, query, args);
        },
        async update(query, args) {
            await db.prepare(query).run(args);
            await dbUpdates.trigger();
        }
    }
}
