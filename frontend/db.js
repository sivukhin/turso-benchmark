import { connect } from "@tursodatabase/sync-browser/vite";
import { connect as connectLocal } from "@tursodatabase/database-browser/vite";

let local = null;
const dbs = new Map();
const authToken = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicm8iLCJnaWQiOiIxMzEyOTk0MC0yMmM4LTRjZjMtYmU1Ni05ZGFjNzA5NWFjOGYiLCJpYXQiOjE3NTc4MzUyNjcsInJpZCI6IjA5ZjViODA5LWJkYWEtNDE1Yy04YTA3LWY5MGZiYjlkYWY0OSJ9.hWttDat9LNicjrnfPqR6VZcJmOVi11UpI9q-SGzBzWbBwlyuD7UheaoOCkFjHTT9RbFdgNy6S4MUiXmaMtMaAA';

export async function setup(name) {
    local = await connectLocal(`${name}-db-local`);
}

export async function attach(name, path, url) {
    if (dbs.has(name)) {
        return;
    }
    const db = await connect({ path: path, url: url, authToken: authToken });
    dbs.set(name, db);
}

export function useLocal() {
    return local; 
}

export function use(name) {
    return dbs.get(name);
}
