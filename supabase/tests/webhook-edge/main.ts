Deno.serve(async req => {
  const worker = await EdgeRuntime.userWorkers.create({
    servicePath: '/probe/probe',
    memoryLimitMb: 256,
    workerTimeoutMs: 30000,
    noModuleCache: false,
    envVars: [],
    cpuTimeSoftLimitMs: 2000,
    cpuTimeHardLimitMs: 2000,
    forceCreate: false,
  });
  return worker.fetch(req);
});
