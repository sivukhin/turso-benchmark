import { html, css, LitElement } from "lit";
import { until } from "lit/directives/until.js";
import { use, useLocal } from "./db.js";

export class BenchmarkRow extends LitElement {
    static styles = css`
      div, span {
        font-size: 20px;
        padding: 4px 4px;
        margin: 8px 0px;
      }
      span:focus {
        cursor: pointer;
      }
    `;
    static properties = {
        db: { type: String },
        query: { type: String },
        arg: { type: String },
    };
    render() {
        const db = use(this.db);
        const local = useLocal();
        const loaded = async () => {
            const selected = (await local.prepare(`SELECT * FROM selected`).all()).map(x => x.name);
            const benchmarks = await db.prepare(this.query).all(this.arg);
            return html`
            <div>
                <span style="font-weight: bold; text-decoration: underline">${this.arg}</span>: 
                ${benchmarks.map(b => {
                    if (selected.includes(b.name)) {
                        return html`
                            <span style="border: 1px dashed black;">
                                <input type="checkbox" id="${b.name}" name="${b.revision}" checked @click=${this.click}/>
                                <label for="${b.name}">${b.revision}</label>
                            </span>
                        `;
                    } else {
                        return html`
                            <span style="border: 1px dashed black;">
                                <input type="checkbox" id="${b.name}" name="${b.name}" @click=${this.click}/>
                                <label for="${b.name}">${b.revision}</label>
                            </span>
                        `;
                    }
                })} 
            </div>`;
        }
        return html`${until(loaded(), html`<span>Loading...</span>`)}`;
    }
    async click(e) {
        const { id, name, checked } = e.target;
        const db = useLocal();
        await db.exec(`CREATE TABLE IF NOT EXISTS selected ( name TEXT PRIMARY KEY, revision TEXT )`);
        if (checked) {
            await db.prepare(`INSERT INTO selected VALUES (?, ?)`).run(id, name);
        } else {
            await db.prepare(`DELETE FROM selected WHERE name = ?`).run(id);
        }
        const finish = new CustomEvent('changed', { bubbles: true });
        this.dispatchEvent(finish);
    }
}
