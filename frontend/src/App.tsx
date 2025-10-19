import { connect } from '@tursodatabase/serverless'
import { useEffect, useState } from 'react';
import { Routes, Route, useSearchParams, Navigate } from 'react-router-dom';
import { tTestTwoSample, mean, variance, sampleStandardDeviation } from "simple-statistics";
import { interpolate, serializeHex } from 'culori';

function url(name: string): string {
  return `libsql://${name}-biblink-spkeu7.aws-eu-west-1.turso.io`;
}

const meta = await connect({
  url: url('meta-info'),
  authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN,
});

export function App() {
  return (
    <div className="flex flex-col min-h-screen text-gray-800">
      <div className="px-6 py-2 border-gray-200 bg-white">
        <h1 className="text-lg font-semibold text-gray-900">
          <a href="/">turso-benchmark</a>
        </h1>
      </div>
      <div className="px-6 py-2 border-gray-200 bg-white">
        <Routes>
          <Route path="/" element={<BenchmarkList />} />
          <Route path="/show" element={<BenchmarkResults />} />
          <Route path="/compare" element={<BenchmarkCompare />} />
        </Routes>
      </div>
    </div>
  );
}

function BenchmarkList() {
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [toggled, setToggled] = useState<string[]>([]);


  function toggle(key: string) {
    if (toggled.includes(key)) {
      setToggled(toggled.filter(x => x != key))
    } else {
      setToggled([...toggled, key])
    }
  }

  useEffect(() => {
    (async function () { setBenchmarks(await meta.prepare("SELECT * FROM benchmarks").all([])); })()
  }, [])

  if (toggled.length == 2) {
    let left, right;
    for (const benchmark of benchmarks) {
      if (benchmark.results == toggled[0]) {
        left = benchmark;
      } else if (benchmark.results == toggled[1]) {
        right = benchmark;
      }
    }
    return <Navigate to={`/compare?leftResults=${encodeURIComponent(left.results)}&leftProfiles=${encodeURIComponent(left.profiles)}&rightResults=${encodeURIComponent(right.results)}&rightProfiles=${encodeURIComponent(right.profiles)}`} replace />;
  }

  return (
    <table className="border border-gray-100 text-sm w-full">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-2 py-1 text-left font-semibold border-b">
            dataset
          </th>
          <th className="px-2 py-1 text-left font-semibold border-b">
            repo
          </th>
          <th className="px-2 py-1 text-left font-semibold border-b">
            branch
          </th>
          <th className="px-2 py-1 text-left font-semibold border-b">
            revision
          </th>
          <th className="px-2 py-1 text-left font-semibold border-b">
            results
          </th>
          <th className="px-2 py-1 text-left font-semibold border-b">
            compare
          </th>
        </tr>
      </thead>
      <tbody>
        {benchmarks.map((b, i) => {
          const shortRev = b.revision.slice(0, 8)
          const showUrl = `/show?results=${encodeURIComponent(b.results)}&profiles=${encodeURIComponent(b.profiles)}`
          return (
            <tr
              key={i}
            >
              <td className="px-3 py-2 border-b">
                <span className="text-gray-500">{b.dataset}</span>
              </td>
              <td className="px-3 py-2 border-b">
                <span className="text-gray-500">{b.repo}</span>
              </td>
              <td className="px-3 py-2 border-b">
                <span className="text-blue-400">{b.branch}</span>
              </td>
              <td className="px-3 py-2 border-b">
                <span className="text-emerald-400">{shortRev}</span>
              </td>
              <td className="px-3 py-2 border-b">
                <a
                  href={showUrl}
                  className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
                  onClick={e => { e.stopPropagation() }}
                >🔍</a>
              </td>
              <td className="px-3 py-2 border-b cursor-pointer" onClick={() => toggle(b.results)}>
                <input type="checkbox" checked={toggled.includes(b.results)} onClick={() => toggle(b.results)}></input>
              </td>
            </tr>
          );
        })}
      </tbody >
    </table >
  );
}

function BenchmarkResults() {
  const [data, setData] = useState<{ measurements: any[], parameters: any[] } | null>(null);
  const [params] = useSearchParams();
  const results = params.get("results")!;
  const profiles = params.get("profiles")!;
  useEffect(() => {
    (async function () {
      const benchmarks = await connect({
        url: url(results),
        authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN,
      })
      const m = await benchmarks.prepare("SELECT * FROM measurements").all([]);
      const p = await benchmarks.prepare("SELECT * FROM parameters").all([]);
      setData({ measurements: m, parameters: p })
    })()
  }, [results, profiles]);
  if (data == null) {
    return <></>
  }
  const runnersSet = new Set<string>();
  for (const m of data.measurements) { runnersSet.add(m.runner); }
  const runners = Array.from(runnersSet.keys());
  return <BenchmarkResultsDb
    left={{ runner: runners[0], name: runners[0], parameters: data.parameters, profiles: profiles, measurements: data.measurements.filter(x => x.runner == runners[0]) }}
    right={{ runner: runners[1], name: runners[1], parameters: data.parameters, profiles: profiles, measurements: data.measurements.filter(x => x.runner == runners[1]) }}
  />
}

function BenchmarkCompare() {
  const [data, setData] = useState<{ left: { measurements: Measurement[], parameters: any[] }, right: { measurements: Measurement[], parameters: any[] } } | null>(null);
  const [params] = useSearchParams();
  const leftResults = params.get("leftResults")!;
  const leftProfiles = params.get("leftProfiles")!;
  const rightResults = params.get("rightResults")!;
  const rightProfiles = params.get("rightProfiles")!;
  useEffect(() => {
    (async function () {
      const left = await connect({
        url: url(leftResults),
        authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN,
      });
      const right = await connect({
        url: url(rightResults),
        authToken: import.meta.env.VITE_TURSO_DB_AUTH_TOKEN,
      })
      const mLeft = await left.prepare("SELECT * FROM measurements").all([]);
      const pLeft = await left.prepare("SELECT * FROM parameters").all([]);
      const mRight = await right.prepare("SELECT * FROM measurements").all([]);
      const pRight = await right.prepare("SELECT * FROM parameters").all([]);
      setData({ left: { measurements: mLeft, parameters: pLeft }, right: { measurements: mRight, parameters: pRight } });
    })()
  }, [leftResults, leftProfiles, rightResults, rightProfiles]);
  if (data == null) {
    return <></>
  }
  const runnersSet = new Set<string>();
  for (const m of data.left.measurements) {
    runnersSet.add(m.runner);
  }
  const runners = Array.from(runnersSet.keys());
  return <>
    {runners.map(r => <BenchmarkResultsDb
      left={{ name: `${r}`, runner: r, parameters: data.left.parameters, profiles: leftProfiles, measurements: data.left.measurements.filter(m => m.runner == r) }}
      right={{ name: `${r}`, runner: r, parameters: data.right.parameters, profiles: rightProfiles, measurements: data.right.measurements.filter(m => m.runner == r) }}
    />)}
  </>
}


type Parameter = {
  name: string;
  value: string;
}

type Measurement = {
  dataset: string;
  name: string;
  measurement: string;
  runner: string;
  value: number;
};

type TableRow = {
  runner: string;
  dataset: string;
  name: string;
  avg: number;
  stddev: number;
  hidden: boolean;
};

type DeltaPoint = {
  dataset: string;
  name: string;
  measurement: string;
  left: number[];
  right: number[];
}

type DeltaTableRow = {
  dataset: string;
  name: string;
  left: string;
  leftAvg: number | null;
  leftStddev: number | null;
  right: string;
  rightAvg: number | null;
  rightStddev: number | null;
  confidence: number;
  hidden: boolean;
}

function logGamma(z: number) {
  var s = 1 + 76.18009173 / z - 86.50532033 / (z + 1) + 24.01409822 / (z + 2) - 1.231739516 / (z + 3) + .00120858003 / (z + 4) - .00000536382 / (z + 5);
  var lg = (z - .5) * Math.log(z + 4.5) - (z + 4.5) + Math.log(s * 2.50662827465);
  return lg
}

function betinc(x: number, a: number, b: number): number {
  var a0 = 0;
  var b0 = 1;
  var a1 = 1;
  var b1 = 1;
  var m9 = 0;
  var a2 = 0;
  var c9;
  while (Math.abs((a1 - a2) / a1) > .00001) {
    a2 = a1;
    c9 = -(a + m9) * (a + b + m9) * x / (a + 2 * m9) / (a + 2 * m9 + 1);
    a0 = a1 + c9 * a0;
    b0 = b1 + c9 * b0;
    m9 = m9 + 1;
    c9 = m9 * (b - m9) * x / (a + 2 * m9 - 1) / (a + 2 * m9);
    a1 = a0 + c9 * a1;
    b1 = b0 + c9 * b1;
    a0 = a0 / b1;
    b0 = b0 / b1;
    a1 = a1 / b1;
    b1 = 1;
  }
  return a1 / a
}

function compute(X: number, df: number) {
  const A = df / 2;
  const S = A + .5;
  const Z = df / (df + X * X);
  const BT = Math.exp(logGamma(S) - logGamma(.5) - logGamma(A) + A * Math.log(Z) + .5 * Math.log(1 - Z));
  let betacdf;
  if (Z < (A + 1) / (S + 2)) {
    betacdf = BT * betinc(Z, A, .5)
  } else {
    betacdf = 1 - BT * betinc(1 - Z, .5, A)
  }
  let tcdf;
  if (X < 0) {
    tcdf = betacdf / 2
  } else {
    tcdf = 1 - betacdf / 2
  }
  return Math.round(tcdf * 100000) / 100000;
}

function ttest(a: number[], b: number[]): number {
  const t = tTestTwoSample(a, b)!;
  const n1 = a.length, n2 = b.length;
  const s1 = variance(a), s2 = variance(b);
  const df = Math.pow(s1 / n1 + s2 / n2, 2) / ((Math.pow(s1 / n1, 2) / (n1 - 1)) + (Math.pow(s2 / n2, 2) / (n2 - 1)));
  // p-value for two-tailed test
  const cdf = compute(t, df);
  const p = 2 * Math.min(cdf, 1 - cdf); // two-tailed
  return 1 - p;
}

function BenhcmarkDiff({ delta, left, right }: { delta: DeltaPoint[], left: Group, right: Group }) {
  const [expanded, setExpanded] = useState<string[]>([]);

  function toggle(key: string) {
    if (expanded.includes(key)) {
      setExpanded([...expanded.filter(x => x != key)])
    } else {
      setExpanded([...expanded, key])
    }
  }

  delta.sort((a, b) => {
    if (a.dataset !== b.dataset) {
      return a.dataset.localeCompare(b.dataset);
    }
    const numbers = /(\d+).*/;
    if (numbers.test(a.name) && numbers.test(b.name)) {
      return Number.parseInt(numbers.exec(a.name)![1]) - Number.parseInt(numbers.exec(b.name)![1]);
    }
    return a.name.localeCompare(b.name);
  });

  let table: DeltaTableRow[] = [];
  for (const line of delta) {
    table.push({
      dataset: line.dataset,
      name: line.name,
      left: left.name,
      leftAvg: mean(line.left),
      leftStddev: sampleStandardDeviation(line.left),
      right: right.name,
      rightAvg: mean(line.right),
      rightStddev: sampleStandardDeviation(line.right),
      confidence: ttest(line.left, line.right),
      hidden: false
    });
    for (let i = 0; i < Math.max(line.left.length, line.right.length); i++) {
      table.push({
        dataset: line.dataset,
        name: line.name,
        left: left.name,
        leftAvg: i < line.left.length ? line.left[i] : null,
        right: right.name,
        rightAvg: i < line.right.length ? line.right[i] : null,
        hidden: true,
        leftStddev: 0,
        rightStddev: 0,
        confidence: 0,
      })
    }
  }
  const parameters = left.parameters == right.parameters ? [left.parameters] : [left.parameters, right.parameters];
  let i = 1;
  return (
    <div className="flex flex-col w-full">
      <div className="text-lg font-semibold mb-3 text-gray-700">
        <span className="px-2 py-1 text-sm text-gray-600">
          {left.name} vs {right.name}
        </span>
      </div>

      <table className="border border-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left font-semibold border-b">
              dataset
            </th>
            <th className="px-2 py-1 text-left font-semibold border-b">
              query
            </th>
            <th className="px-2 py-1 text-left font-semibold border-b">
              avg&nbsp;(s)
            </th>
            <th className="px-2 py-1 text-left  font-semibold border-b">
              std.dev.
            </th>
            <th className="px-3 py-2 text-center font-medium border-b">
            </th>
            <th className="px-2 py-1 text-left  font-semibold border-b">
              avg&nbsp;(s)
            </th>
            <th className="px-2 py-1 text-left  font-semibold border-b">
              std.dev.
            </th>
            <th className="px-3 py-2 text-center font-medium border-b">
            </th>
            <th className="px-2 py-1 text-left font-semibold border-b">
              <span title="confidence of the delta between measurements (based on two-sample t-test)">Δ-confidence</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map(g => {
            if (!g.hidden) { i += 1; }
            function stdColor(avg: number | null, stddev: number | null): string {
              const rel = (stddev ?? 0) / (avg ?? 1);
              let color = "text-gray-600";
              if (rel > 0.15) color = "text-red-600 font-semibold";
              else if (rel > 0.07) color = "text-amber-600 font-medium";
              return color;
            }
            let leftStdColor = stdColor(g.leftAvg, g.leftStddev);
            let rightStdColor = stdColor(g.rightAvg, g.rightStddev);
            let background = i % 2 == 0 ? " bg-white hover:bg-gray-100" : " bg-gray-200 hover:bg-gray-300";
            const key = `${g.dataset}:${g.name}`;
            if (g.hidden && !expanded.includes(key)) {
              background += " hidden";
            }
            if (g.hidden) {
              background += " text-gray-600"
            } else {
              background += " cursor-pointer";
            }

            let color = '#000000';
            let weight = '';
            let caption = '';
            if (!g.hidden && (g.rightAvg ?? 0) < (g.leftAvg ?? 0)) {
              color = serializeHex(interpolate(['#000000', '#7ce87cff'])(Math.pow(g.confidence, 5)));
            }
            if (!g.hidden && (g.rightAvg ?? 0) > (g.leftAvg ?? 0)) {
              color = serializeHex(interpolate(['#000000', '#f64f4fff'])(Math.pow(g.confidence, 5)));
            }
            if (g.confidence > 0.9) {
              weight = '600';
              caption = (g.rightAvg ?? 0) < (g.leftAvg ?? 0) ?
                ` (${((g.leftAvg ?? 0) / (g.rightAvg ?? 0) * 100 - 100).toFixed(1)}% faster)` :
                ` (${((g.rightAvg ?? 0) / (g.leftAvg ?? 0) * 100 - 100).toFixed(1)}% slower)`;
            }
            const leftProfileUrl = encodeURIComponent(`http://localhost:8080/profile/${left.profiles}/${left.runner}/${g.dataset}/${g.name}/profile.json`);
            const leftSymbolsUrl = encodeURIComponent(`http://localhost:8080/profile/${left.profiles}/${left.runner}/${g.dataset}/${g.name}`);
            const leftProfile = `https://profiler.firefox.com/from-url/${leftProfileUrl}/?symbolServer=${leftSymbolsUrl}`;

            const rightProfileUrl = encodeURIComponent(`http://localhost:8080/profile/${right.profiles}/${right.runner}/${g.dataset}/${g.name}/profile.json`);
            const rightSymbolsUrl = encodeURIComponent(`http://localhost:8080/profile/${right.profiles}/${right.runner}/${g.dataset}/${g.name}`);
            const rightProfile = `https://profiler.firefox.com/from-url/${rightProfileUrl}/?symbolServer=${rightSymbolsUrl}`;
            return (
              <tr
                key={i}
                className={background}
                onClick={!g.hidden ? () => toggle(key) : () => { }}
              >
                <td className="px-3 py-2 border-b">{g.dataset}</td>
                <td className="px-3 py-2 border-b">{g.name}</td>
                <td className="px-2 py-1 border-b text-left tabular-nums">
                  {g.leftAvg?.toFixed(3)}
                </td>
                <td className={`px-2 py-1 border-b text-left tabular-nums`}>
                  {!g.hidden && <span className={leftStdColor}>{g.leftStddev?.toFixed(3)}</span>}
                </td>
                <td className="px-3 py-2 text-center border-b">
                  {!g.hidden && <a href={leftProfile} className="text-blue-600 hover:underline" target="_blank">📊</a>}
                </td>
                <td className="px-2 py-1 border-b text-left tabular-nums">
                  {!g.hidden && (
                    <>
                      <span style={{ color: color, fontWeight: weight }}>{g.rightAvg?.toFixed(3)}</span>
                      <span className='text-gray-500'>{caption}</span>
                    </>
                  )}
                  {g.hidden && g.rightAvg?.toFixed(3)}
                </td>
                <td className={`px-2 py-1 border-b text-left tabular-nums`}>
                  {!g.hidden && <span className={rightStdColor}>{g.rightStddev?.toFixed(3)}</span>}
                </td>
                <td className="px-3 py-2 text-center border-b">
                  {!g.hidden && <a href={rightProfile} className="text-blue-600 hover:underline" target="_blank">📊</a>}
                </td>
                <td className="px-3 py-2 text-left border-b">
                  {!g.hidden && <span style={{ fontWeight: weight }}>{(g.confidence * 100)?.toFixed(1)}%</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-row justify-between">
        {parameters.map(ps => {
          ps.sort((a, b) => a.name.localeCompare(b.name));
          return (<div
            className="bg-white border border-gray-200 p-4"
          >
            {ps.map(p => (
              <div className="text-xs text-gray-600">
                {p.name}: {p.value}
              </div>
            ))}
          </div>)
        }
        )}
      </div>
    </div>
  );
}

type Group = {
  name: string;
  runner: string;
  profiles: string;
  parameters: Parameter[];
  measurements: Measurement[];
};


function BenchmarkResultsDb({ left, right }: { left: Group, right: Group }) {
  const leftValues = new Map();
  const rightValues = new Map();
  const keys = new Set<string>();
  for (const group of [left, right]) {
    group.measurements.sort((a, b) => {
      if (a.dataset !== b.dataset) return a.dataset.localeCompare(b.dataset);
      const numbers = /(\d+).*/;
      let result;
      if (numbers.test(a.name) && numbers.test(b.name)) {
        result = Number.parseInt(numbers.exec(a.name)![1]) - Number.parseInt(numbers.exec(b.name)![1]);
      } else {
        result = a.name.localeCompare(b.name);
      }
      return result;
    });
    for (const m of group.measurements) {
      const key = `${m.dataset}:${m.name}:${m.measurement}`;
      if (!leftValues.has(key)) { leftValues.set(key, []); }
      if (!rightValues.has(key)) { rightValues.set(key, []); }
      keys.add(key);
      if (group == left) { leftValues.get(key).push(m.value); }
      else { rightValues.get(key).push(m.value); }
    }
  }
  const deltaPoints: DeltaPoint[] = [];
  for (const key of keys.keys()) {
    const tokens = key.split(':');
    deltaPoints.push({
      dataset: tokens[0],
      name: tokens[1],
      measurement: tokens[2],
      left: leftValues.get(key) ?? [],
      right: rightValues.get(key) ?? [],
    })
  }

  if (deltaPoints.length > 0) {
    return <BenhcmarkDiff delta={deltaPoints} left={left} right={right} />
  } else {
    return <></>
  }
}

function BenchmarkLine({
  dataset,
  repo,
  branch,
  revision,
  results,
  profiles,
}: {
  repo: string,
  branch: string,
  revision: string,
  dataset: string,
  results: string,
  profiles: string,
}) {
  const shortRev = revision.slice(0, 8)
  const showUrl = `/show?results=${encodeURIComponent(results)}&profiles=${encodeURIComponent(profiles)}`
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1 text-sm border-b border-gray-700/40 hover:bg-gray-400/30">
      <div className="flex items-center gap-2 font-mono text-gray-200">
        <span className="text-gray-500">{dataset}</span>
        <span className="text-gray-500">|</span>
        <span className="text-gray-500">{repo}</span>
        <span className="text-gray-500">|</span>
        <span className="text-blue-400">{branch}</span>
        <span className="text-gray-500">@</span>
        <span className="text-emerald-400">{shortRev}</span>

        <a
          href={showUrl}
          className="text-blue-400 hover:text-blue-300 underline decoration-dotted"
        >
          results
        </a>
      </div>
    </div>
  )
}

