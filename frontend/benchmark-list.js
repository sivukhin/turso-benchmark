import { html, css, LitElement } from "lit";
import { until } from "lit/directives/until.js";
import { use, useLocal } from "./db.js";

export class BenchmarkList extends LitElement {
    static properties = {
        db: { type: String },
        query: { type: String },
        action: { state: true }
    };
    static styles = css`
    button {
        padding: 4px;
        font-family: monospace;
        width: 512px;
    }
    `;
    constructor() {
        super();
        this.action = { text: 'nothing selected', path: '' };
        this.changed();
    }
    render() {
        const db = use(this.db);
        const loaded = async () => {
            const benchmarks = await db.prepare(`SELECT DISTINCT branch FROM (${this.query})`).all();
            return html`
            <div>
                <button @click=${this.do} type="button">${this.action.text}</button>
                ${benchmarks.map(
                    b => html`<benchmark-row @changed=${this.changed} db=${this.db} query=${`${this.query} WHERE branch = ?`} arg=${b.branch}></benchmark-row>`
                )}
            </div>`;
        }
        return html`${until(loaded(), html`<span>Loading...</span>`)}`;
    }
    async changed(e) {
        const db = useLocal();
        await db.exec("CREATE TABLE IF NOT EXISTS selected ( name TEXT PRIMARY KEY, revision TEXT )");
        const selected = await db.prepare('SELECT * FROM selected').all();
        if (selected.length == 0) {
            this.action = { text: 'nothing selected', path: '' };
        } else if (selected.length == 1) {
            this.action = { text: `${selected[0].revision}`, path: `/show/${selected[0].name}` };
        } else if (selected.length == 2) {
            this.action = { text: `${selected[0].revision} vs ${selected[1].revision}`, path: `/compare/${selected[0].name}/${selected[1].name}` };
        } else {
            this.action = `too many selections`;
        }
    }
    do(e) {
        window.location.href = this.action.path;
    }
}
