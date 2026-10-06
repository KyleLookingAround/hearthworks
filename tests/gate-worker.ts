/** Runs one gate in a worker thread for tests/gates.test.ts, so the gates run side by side. */
import { parentPort, workerData } from 'node:worker_threads';
import { runGate } from '../src/gates/executor.ts';

parentPort!.postMessage(await runGate(workerData as string));
