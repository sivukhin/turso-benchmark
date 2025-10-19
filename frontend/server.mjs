import http from "http";
import { spawn } from "child_process";
import httpProxy from "http-proxy";
import { mkdtempSync, rm, writeFileSync } from "fs";
import { join } from "path";
import { cwd } from "process";
import { createServer } from "net";
import { connect } from "@tursodatabase/serverless";

function getEphemeralPort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, () => {
      let port = s.address().port;
      s.close(err => err ? reject(err) : resolve(port))
    });
    s.on('error', reject);
  });
}

const proxy = httpProxy.createProxyServer({});

let samplyProcesses = [];

const TIMEOUT_MS = 5_000;

function url(name) {
  return `libsql://${name}-biblink-spkeu7.aws-eu-west-1.turso.io`;
}

const server = http.createServer(async (req, res) => {
  const components = req.url.split('/');

  const prefix = components.slice(0, 6).join('/');
  const suffix = components.slice(6).join('/');
  console.info('prefix', prefix, 'suffix', suffix);

  if (samplyProcesses.every(x => x.prefix != prefix)) {
    console.info('samply process not found for prefix, creating new one', prefix);
    const name = components[2];
    console.info(components);
    const db = connect({ url: url(name), authToken: process.env.TURSO_DB_AUTH_TOKEN });
    let profiles;
    try {
      profiles = await db.prepare("SELECT filename, content FROM profiles WHERE runner = ? AND dataset = ? AND name = ?").all([
        components[3],
        components[4],
        components[5],
      ]);
    } catch (e) {
      console.error('wtf', e);
      throw e;
    }


    const tmp = mkdtempSync(join(cwd(), "samply-tmp-dir-"));
    let target = '';
    for (const file of profiles) {
      console.info('writing file', file.filename);
      if (!file.filename.includes('syms.json')) {
        target = file.filename;
      }
      writeFileSync(join(tmp, file.filename), file.content);
    }
    console.log("Starting samply...");
    const port = await getEphemeralPort();
    let samplyProcess = spawn("samply", ["load", join(tmp, target), "--port", `${port}`, "--symbol-dir", tmp], { stdio: "inherit" });
    let samplyDescriptor = { process: samplyProcess, samplyId: '', dir: tmp, prefix: prefix, port: port };
    samplyProcesses.push(samplyDescriptor)
    let start = performance.now();
    while (performance.now() - start < TIMEOUT_MS) {
      try {
        const pattern = /\/([^\/]*)\/profile.json/
        const result = await (await fetch(`http://127.0.0.1:${port}`)).text();
        if (pattern.test(result)) {
          samplyDescriptor.samplyId = pattern.exec(result)[1];
          break;
        }
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    console.info(samplyDescriptor.samplyId);

    const timeoutId = setTimeout(() => {
      samplyProcesses = [...samplyProcesses.filter(x => x.prefix != prefix)]
      if (samplyProcess) {
        console.log("Timeout reached, killing samply...");
        samplyProcess.kill("SIGTERM");
        rm(tmp, { force: true, recursive: true }, () => { });
      }
    }, TIMEOUT_MS);

    samplyProcess.on("exit", (code) => {
      console.log("Samply exited with code", code);
      clearTimeout(timeoutId);
    });
  }
  for (const samplyProcess of samplyProcesses) {
    if (samplyProcess.prefix != prefix) {
      continue;
    }

    req.url = `/${samplyProcess.samplyId}/${suffix}`;
    const proxyReq = proxy.web(req, res, { target: `http://localhost:${samplyProcess.port}` });

    // Kill proxy connection after timeout (useful if Samply is slow)
    const connectionTimeout = setTimeout(() => {
      res.writeHead(504, { "Content-Type": "text/plain" });
      res.end("Proxy timeout\n");
      proxyReq?.destroy?.(); // Close request if still active
    }, TIMEOUT_MS);

    res.on("close", () => clearTimeout(connectionTimeout));
    return;
  }
});

server.listen(8080, () => {
  console.log("Server running at http://localhost:8080");
  console.log("POST /start to launch samply (auto-kills after 30s)");
});
