import { connect } from '@tursodatabase/serverless'

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
const firstName = urlParams.get('first');
const secondName = urlParams.get('second');

const first = connect({
  url: `libsql://${firstName}-sivukhin.aws-eu-north-1.turso.io`,
  authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN
});
const second = connect({
  url: `libsql://${secondName}-sivukhin.aws-eu-north-1.turso.io`,
  authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN
});
const firstParams = await first.prepare('select * from parameters').all();
const secondParams = await second.prepare('select * from parameters').all();


async function renderParameters(conn, container) {
    const params = await conn.prepare('select * from parameters').all();
    const parameters = document.createElement("div");
    container.appendChild(parameters);
    let benchmarks = [];
    for (const param of params) {
        if (param.name.startsWith('benchmark')) {
            benchmarks.push(param.value);
            continue;
        }
        const element = document.createElement("div");
        element.innerText = `${param.name}: ${param.value}`;
        parameters.appendChild(element);
    }
    return benchmarks;
}

function avg(x) {
    return x.reduce((a, b) => a + b) / x.length;
}

function stddev(x) {
    const mean = avg(x);
    return Math.sqrt(x.map(x => (x - mean) * (x - mean)).reduce((a, b) => a + b)) / (x.length - 1);
}

function med(x) {
    x.sort();
    return x[(x.length / 2) | 0];
}

async function renderBenchmark(name, container) {
    const firstS = await first.prepare(`select * from ${name} order by measurement, benchmark`).all();
    const secondS = await second.prepare(`select * from ${name} order by measurement, benchmark`).all();
    const stats = new Map();
    for (const s of firstS) {
        const name = `${s.measurement}-${s.benchmark}`;
        if (stats.get(name) == null) {
            stats.set(name, {first: [], second: []});
        }
        stats.get(name).first.push(s.value / s.iterations);
    }
    for (const s of secondS) {
        const name = `${s.measurement}-${s.benchmark}`;
        if (stats.get(name) == null) {
            stats.set(name, {first: [], second: []});
        }
        stats.get(name).second.push(s.value / s.iterations);
    }
    for (const [benchmark, stat] of stats.entries()) {
        const row = document.createElement("tr");
        const name = document.createElement("td");
        const avg1 = document.createElement("td");
        const med1 = document.createElement("td");
        const avg2 = document.createElement("td");
        const med2 = document.createElement("td");
        const compare = document.createElement("td");

        name.innerText = benchmark;
        const std1 = stddev(stat.first);
        const std2 = stddev(stat.first);
        avg1.innerText = `${avg(stat.first).toFixed(2)}`;
        avg2.innerText = `${avg(stat.second).toFixed(2)}`;
        med1.innerText = `${med(stat.first).toFixed(2)}`;
        med2.innerText = `${med(stat.second).toFixed(2)}`;
        if (avg(stat.first) + std1 < avg(stat.second) - std2) {
            avg1.classList.toggle("win");
            med1.classList.toggle("win");
            avg2.classList.toggle("loose");
            med2.classList.toggle("loose");
            compare.innerText = "<";
        } else if (avg(stat.first) - std1 > avg(stat.second) + std2) {
            avg2.classList.toggle("win");
            med2.classList.toggle("win");
            avg1.classList.toggle("loose");
            med1.classList.toggle("loose");
            compare.innerText = ">";
        } else {
            compare.innerText = "=";
        }

        row.appendChild(name);
        row.appendChild(avg1);
        row.appendChild(med1);
        row.appendChild(compare);
        row.appendChild(med2);
        row.appendChild(avg2);
        container.appendChild(row);
    }
}

const benchmarks = await renderParameters(first, document.getElementById("first"));
await renderParameters(second, document.getElementById("second"));

for (const benchmark of benchmarks) {
    await renderBenchmark(benchmark, document.getElementById("results"));
    await renderBenchmark(`${benchmark}_baseline`, document.getElementById("baseline"));
}
